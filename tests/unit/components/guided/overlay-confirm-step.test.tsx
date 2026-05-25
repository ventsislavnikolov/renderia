import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	type Mock,
	vi,
} from "vitest";

/**
 * Integration tests for the overlay-confirm step.
 *
 * Asserts the HIGH-1 fix from Task 8 review: a *fresh* signed URL is minted
 * right before the detection server-fn call, not the one cached in state at
 * mount time. The cached one is only safe for the `<img>` tag that already
 * loaded it.
 *
 * Also exercises the box toggle behavior + aria-label/aria-pressed wiring,
 * unmount cancellation via `cancelledRef`, and the UNAUTHENTICATED redirect
 * path.
 */

const {
	createSignedUrlMock,
	storageFromMock,
	detectProtectedElementsMock,
	getAuthHeadersMock,
} = vi.hoisted(() => {
	const createSignedUrl = vi.fn();
	return {
		createSignedUrlMock: createSignedUrl,
		storageFromMock: vi.fn(() => ({ createSignedUrl })),
		detectProtectedElementsMock: vi.fn(),
		getAuthHeadersMock: vi.fn(),
	};
});

vi.mock("../../../../src/lib/supabase/browser", () => ({
	supabaseBrowser: {
		storage: { from: storageFromMock },
	},
}));

vi.mock("../../../../src/server/generation", () => ({
	detectProtectedElements: (...args: unknown[]) =>
		detectProtectedElementsMock(...args),
}));

vi.mock("../../../../src/lib/server-client/auth-headers", () => ({
	UNAUTHENTICATED_ERROR: "UNAUTHENTICATED",
	getAuthHeaders: (...args: unknown[]) => getAuthHeadersMock(...args),
}));

import { OverlayConfirmStep } from "../../../../src/components/guided/overlay-confirm-step";

const samplePhoto = {
	id: "ph-1",
	owner_id: "user-1",
	project_id: "p1",
	storage_bucket: "source-photos" as const,
	storage_path: "user-1/photo.png",
	original_name: "photo.png",
	content_type: "image/png",
	width: null,
	height: null,
	notes: null,
	created_at: "2026-01-01T00:00:00Z",
};

const sampleBoxes = [
	{
		label: "left window",
		kind: "window" as const,
		x: 0.1,
		y: 0.2,
		width: 0.2,
		height: 0.3,
		confidence: 0.9,
	},
	{
		label: "main door",
		kind: "door" as const,
		x: 0.55,
		y: 0.35,
		width: 0.15,
		height: 0.45,
		confidence: 0.8,
	},
];

const originalLocation = window.location;

beforeEach(() => {
	createSignedUrlMock.mockReset();
	storageFromMock.mockClear();
	detectProtectedElementsMock.mockReset();
	getAuthHeadersMock
		.mockReset()
		.mockResolvedValue({ Authorization: "Bearer test-token" });

	Object.defineProperty(window, "location", {
		configurable: true,
		writable: true,
		value: { ...originalLocation, assign: vi.fn() },
	});
});

afterEach(() => {
	Object.defineProperty(window, "location", {
		configurable: true,
		writable: true,
		value: originalLocation,
	});
});

describe("OverlayConfirmStep", () => {
	it("mints a signed URL on mount and renders the photo", async () => {
		createSignedUrlMock.mockResolvedValue({
			data: { signedUrl: "https://signed/initial.png" },
			error: null,
		});
		render(
			<OverlayConfirmStep
				photo={samplePhoto}
				taskTitle="ceiling"
				confirmedElements={[]}
				onConfirm={vi.fn()}
			/>,
		);

		const img = await screen.findByAltText("photo.png");
		expect(img.getAttribute("src")).toBe("https://signed/initial.png");
		expect(storageFromMock).toHaveBeenCalledWith("source-photos");
	});

	it("mints a fresh signed URL per detection (HIGH-1 fix, not the cached one)", async () => {
		const user = userEvent.setup();
		createSignedUrlMock
			.mockResolvedValueOnce({
				data: { signedUrl: "https://signed/first.png" },
				error: null,
			})
			.mockResolvedValueOnce({
				data: { signedUrl: "https://signed/second.png" },
				error: null,
			});
		detectProtectedElementsMock.mockResolvedValue(sampleBoxes);

		render(
			<OverlayConfirmStep
				photo={samplePhoto}
				taskTitle="ceiling"
				confirmedElements={[]}
				onConfirm={vi.fn()}
			/>,
		);

		await screen.findByAltText("photo.png");
		await user.click(
			screen.getByRole("button", { name: /detect protected elements/i }),
		);

		await waitFor(() =>
			expect(detectProtectedElementsMock).toHaveBeenCalledTimes(1),
		);
		// First signed URL was minted on mount (for the <img>), second on the
		// detection click. The detection call must see the SECOND, fresh URL.
		expect(createSignedUrlMock).toHaveBeenCalledTimes(2);
		const detectCall = detectProtectedElementsMock.mock.calls[0]?.[0] as {
			data: { photoUrl: string };
		};
		expect(detectCall.data.photoUrl).toBe("https://signed/second.png");
	});

	it("renders detected boxes with toggle-able selection and confirms the selected subset", async () => {
		const user = userEvent.setup();
		createSignedUrlMock.mockResolvedValue({
			data: { signedUrl: "https://signed/a.png" },
			error: null,
		});
		detectProtectedElementsMock.mockResolvedValue(sampleBoxes);
		const onConfirm = vi.fn();

		render(
			<OverlayConfirmStep
				photo={samplePhoto}
				taskTitle="ceiling"
				confirmedElements={[]}
				onConfirm={onConfirm}
			/>,
		);

		await screen.findByAltText("photo.png");
		await user.click(
			screen.getByRole("button", { name: /detect protected elements/i }),
		);

		// Both detected elements rendered with proper aria-label and pressed.
		const windowToggle = await screen.findByRole("button", {
			name: /Toggle left window protection/,
		});
		const doorToggle = screen.getByRole("button", {
			name: /Toggle main door protection/,
		});
		expect(windowToggle.getAttribute("aria-pressed")).toBe("true");
		expect(doorToggle.getAttribute("aria-pressed")).toBe("true");

		// Deselect the door box and confirm.
		await user.click(doorToggle);
		expect(doorToggle.getAttribute("aria-pressed")).toBe("false");

		await user.click(
			screen.getByRole("button", { name: /confirm selection and continue/i }),
		);
		expect(onConfirm).toHaveBeenCalledTimes(1);
		const confirmedArg = onConfirm.mock.calls[0]?.[0] as Array<{
			label: string;
		}>;
		expect(confirmedArg).toHaveLength(1);
		expect(confirmedArg[0]?.label).toBe("left window");
	});

	it("surfaces the detection error in a live region without crashing", async () => {
		const user = userEvent.setup();
		createSignedUrlMock.mockResolvedValue({
			data: { signedUrl: "https://signed/a.png" },
			error: null,
		});
		detectProtectedElementsMock.mockRejectedValue(new Error("provider 500"));

		render(
			<OverlayConfirmStep
				photo={samplePhoto}
				taskTitle="ceiling"
				confirmedElements={[]}
				onConfirm={vi.fn()}
			/>,
		);

		await screen.findByAltText("photo.png");
		await user.click(
			screen.getByRole("button", { name: /detect protected elements/i }),
		);

		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toMatch(/provider 500/);
	});

	it("redirects to /auth when the server fn surfaces UNAUTHENTICATED", async () => {
		const user = userEvent.setup();
		createSignedUrlMock.mockResolvedValue({
			data: { signedUrl: "https://signed/a.png" },
			error: null,
		});
		detectProtectedElementsMock.mockRejectedValue(new Error("UNAUTHENTICATED"));
		const assignSpy = window.location.assign as unknown as Mock;

		render(
			<OverlayConfirmStep
				photo={samplePhoto}
				taskTitle="ceiling"
				confirmedElements={[]}
				onConfirm={vi.fn()}
			/>,
		);

		await screen.findByAltText("photo.png");
		await user.click(
			screen.getByRole("button", { name: /detect protected elements/i }),
		);

		await waitFor(() => expect(assignSpy).toHaveBeenCalledWith("/auth"));
	});

	it("does not call onConfirm with stale state after unmount", async () => {
		const user = userEvent.setup();
		// Hold detection in flight so the unmount lands before resolution.
		let resolveDetection: (value: typeof sampleBoxes) => void = () => {};
		createSignedUrlMock.mockResolvedValue({
			data: { signedUrl: "https://signed/a.png" },
			error: null,
		});
		detectProtectedElementsMock.mockImplementationOnce(
			() =>
				new Promise<typeof sampleBoxes>((resolve) => {
					resolveDetection = resolve;
				}),
		);
		const onConfirm = vi.fn();

		const { unmount } = render(
			<OverlayConfirmStep
				photo={samplePhoto}
				taskTitle="ceiling"
				confirmedElements={[]}
				onConfirm={onConfirm}
			/>,
		);

		await screen.findByAltText("photo.png");
		await user.click(
			screen.getByRole("button", { name: /detect protected elements/i }),
		);
		unmount();
		// Resolve the in-flight detection after unmount — the component should
		// observe `cancelledRef` and not attempt to setState (no error thrown).
		resolveDetection(sampleBoxes);
		await new Promise((r) => setTimeout(r, 0));
		expect(onConfirm).not.toHaveBeenCalled();
	});
});
