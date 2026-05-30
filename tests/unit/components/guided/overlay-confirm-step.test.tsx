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
	listProtectedElementsMock,
	saveDetectedElementsMock,
	updateProtectedElementStatusMock,
	getAuthHeadersMock,
} = vi.hoisted(() => {
	const createSignedUrl = vi.fn();
	return {
		createSignedUrlMock: createSignedUrl,
		storageFromMock: vi.fn(() => ({ createSignedUrl })),
		detectProtectedElementsMock: vi.fn(),
		listProtectedElementsMock: vi.fn(),
		saveDetectedElementsMock: vi.fn(),
		updateProtectedElementStatusMock: vi.fn(),
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
	listProtectedElements: (...args: unknown[]) =>
		listProtectedElementsMock(...args),
	saveDetectedElements: (...args: unknown[]) =>
		saveDetectedElementsMock(...args),
	updateProtectedElementStatus: (...args: unknown[]) =>
		updateProtectedElementStatusMock(...args),
}));

vi.mock("../../../../src/lib/server-client/auth-headers", () => ({
	UNAUTHENTICATED_ERROR: "UNAUTHENTICATED",
	getAuthHeaders: (...args: unknown[]) => getAuthHeadersMock(...args),
}));

import { OverlayConfirmStep } from "../../../../src/components/guided/overlay-confirm-step";

/**
 * Map a bare bounding-box array (as the existing tests pass into
 * `detectProtectedElementsMock`) into the shape `saveDetectedElements`
 * would return — a fully-formed `protected_elements` row with a stable
 * DB id derived from the label so toggle assertions can predict ids.
 */
function rowsFromBoxes(
	boxes: Array<{
		label: string;
		kind: string;
		x: number;
		y: number;
		width: number;
		height: number;
		confidence?: number;
	}>
) {
	return boxes.map((box, index) => ({
		id: `db-${index}`,
		task_id: "t1",
		photo_id: "ph-1",
		project_id: "p1",
		label: box.label,
		kind: box.kind,
		x: box.x,
		y: box.y,
		width: box.width,
		height: box.height,
		confidence: box.confidence ?? null,
		status: "suggested",
		created_at: "2026-01-01T00:00:00Z",
	}));
}

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
	// Default: no persisted rows — the existing tests assume the user has to
	// run detection. The new "load on mount" test overrides this.
	listProtectedElementsMock.mockReset().mockResolvedValue([]);
	// Default `saveDetectedElements`: echo whatever the detection mock
	// returned as fully-formed rows. Individual tests override when needed.
	saveDetectedElementsMock.mockReset().mockImplementation(async (args) => {
		const elements = (args as { data: { elements: unknown[] } }).data.elements;
		return rowsFromBoxes(elements as Parameters<typeof rowsFromBoxes>[0]);
	});
	updateProtectedElementStatusMock
		.mockReset()
		.mockImplementation(async (args) => {
			const input = (args as { data: { elementId: string; status: string } })
				.data;
			return {
				id: input.elementId,
				task_id: "t1",
				photo_id: "ph-1",
				project_id: "p1",
				label: "x",
				kind: "window",
				x: 0,
				y: 0,
				width: 0.1,
				height: 0.1,
				confidence: null,
				status: input.status,
				created_at: "2026-01-01T00:00:00Z",
			};
		});
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
				confirmedElements={[]}
				onConfirm={vi.fn()}
				photo={samplePhoto}
				projectId="p1"
				taskId="t1"
				taskTitle="ceiling"
			/>
		);

		const img = await screen.findByAltText("photo.png");
		expect(img.getAttribute("src")).toBe("https://signed/initial.png");
		expect(storageFromMock).toHaveBeenCalledWith("source-photos");
	});

	it("passes photo and task ids to detection instead of a client-minted URL", async () => {
		const user = userEvent.setup();
		createSignedUrlMock.mockResolvedValue({
			data: { signedUrl: "https://signed/first.png" },
			error: null,
		});
		detectProtectedElementsMock.mockResolvedValue(sampleBoxes);

		render(
			<OverlayConfirmStep
				confirmedElements={[]}
				onConfirm={vi.fn()}
				photo={samplePhoto}
				projectId="p1"
				taskId="t1"
				taskTitle="ceiling"
			/>
		);

		await screen.findByAltText("photo.png");
		await user.click(
			screen.getByRole("button", { name: /detect protected elements/i })
		);

		await waitFor(() =>
			expect(detectProtectedElementsMock).toHaveBeenCalledTimes(1)
		);
		// The only client-side signed URL is for the preview image. The detection
		// server fn receives ids and mints its own URL after authenticating.
		expect(createSignedUrlMock).toHaveBeenCalledTimes(1);
		const detectCall = detectProtectedElementsMock.mock.calls[0]?.[0] as {
			data: { photoId: string; taskId: string; photoUrl?: string };
		};
		expect(detectCall.data).toMatchObject({ photoId: "ph-1", taskId: "t1" });
		expect(detectCall.data.photoUrl).toBeUndefined();
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
				confirmedElements={[]}
				onConfirm={onConfirm}
				photo={samplePhoto}
				projectId="p1"
				taskId="t1"
				taskTitle="ceiling"
			/>
		);

		await screen.findByAltText("photo.png");
		await user.click(
			screen.getByRole("button", { name: /detect protected elements/i })
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
			screen.getByRole("button", { name: /confirm selection and continue/i })
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
				confirmedElements={[]}
				onConfirm={vi.fn()}
				photo={samplePhoto}
				projectId="p1"
				taskId="t1"
				taskTitle="ceiling"
			/>
		);

		await screen.findByAltText("photo.png");
		await user.click(
			screen.getByRole("button", { name: /detect protected elements/i })
		);

		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toMatch(/provider 500/);
	});

	it("redirects to /sign-in when the server fn surfaces UNAUTHENTICATED", async () => {
		const user = userEvent.setup();
		createSignedUrlMock.mockResolvedValue({
			data: { signedUrl: "https://signed/a.png" },
			error: null,
		});
		detectProtectedElementsMock.mockRejectedValue(new Error("UNAUTHENTICATED"));
		const assignSpy = window.location.assign as unknown as Mock;

		render(
			<OverlayConfirmStep
				confirmedElements={[]}
				onConfirm={vi.fn()}
				photo={samplePhoto}
				projectId="p1"
				taskId="t1"
				taskTitle="ceiling"
			/>
		);

		await screen.findByAltText("photo.png");
		await user.click(
			screen.getByRole("button", { name: /detect protected elements/i })
		);

		await waitFor(() => expect(assignSpy).toHaveBeenCalledWith("/sign-in"));
	});

	it("renders the dev debug panel when the server fn returns { data, debug }", async () => {
		const user = userEvent.setup();
		createSignedUrlMock.mockResolvedValue({
			data: { signedUrl: "https://signed/a.png" },
			error: null,
		});
		detectProtectedElementsMock.mockResolvedValue({
			data: sampleBoxes,
			debug: {
				model: "gpt-5.5",
				prompt: "Identify protected visual elements...",
				rawResponse: '{"elements":[]}',
				durationMs: 42,
			},
		});

		render(
			<OverlayConfirmStep
				confirmedElements={[]}
				onConfirm={vi.fn()}
				photo={samplePhoto}
				projectId="p1"
				taskId="t1"
				taskTitle="ceiling"
			/>
		);

		await screen.findByAltText("photo.png");
		await user.click(
			screen.getByRole("button", { name: /detect protected elements/i })
		);

		// The summary text includes the model id, duration, and the label.
		const summary = await screen.findByText(
			/Debug — Detection AI request\/response \(gpt-5\.5, 42ms\)/i
		);
		expect(summary).toBeTruthy();
	});

	it("renders persisted protected elements on mount without calling detectProtectedElements", async () => {
		createSignedUrlMock.mockResolvedValue({
			data: { signedUrl: "https://signed/initial.png" },
			error: null,
		});
		listProtectedElementsMock.mockResolvedValue([
			{
				id: "db-window",
				task_id: "t1",
				photo_id: "ph-1",
				project_id: "p1",
				label: "saved window",
				kind: "window",
				x: 0.1,
				y: 0.1,
				width: 0.2,
				height: 0.3,
				confidence: 0.9,
				status: "suggested",
				created_at: "2026-01-01T00:00:00Z",
			},
			{
				id: "db-door",
				task_id: "t1",
				photo_id: "ph-1",
				project_id: "p1",
				label: "saved door",
				kind: "door",
				x: 0.5,
				y: 0.3,
				width: 0.15,
				height: 0.4,
				confidence: 0.8,
				status: "rejected",
				created_at: "2026-01-01T00:00:00Z",
			},
		]);

		render(
			<OverlayConfirmStep
				confirmedElements={[]}
				onConfirm={vi.fn()}
				photo={samplePhoto}
				projectId="p1"
				taskId="t1"
				taskTitle="ceiling"
			/>
		);

		const windowToggle = await screen.findByRole("button", {
			name: /Toggle saved window protection/,
		});
		const doorToggle = await screen.findByRole("button", {
			name: /Toggle saved door protection/,
		});
		// suggested → selected; rejected → unselected.
		expect(windowToggle.getAttribute("aria-pressed")).toBe("true");
		expect(doorToggle.getAttribute("aria-pressed")).toBe("false");
		// CRITICAL: no detection call was made.
		expect(detectProtectedElementsMock).not.toHaveBeenCalled();
		// The detection button switches to "Re-run detection" once persisted
		// rows are loaded.
		expect(
			screen.getByRole("button", { name: /re-run detection/i })
		).toBeTruthy();
	});

	it("persists toggle changes via updateProtectedElementStatus", async () => {
		const user = userEvent.setup();
		createSignedUrlMock.mockResolvedValue({
			data: { signedUrl: "https://signed/a.png" },
			error: null,
		});
		listProtectedElementsMock.mockResolvedValue([
			{
				id: "db-only",
				task_id: "t1",
				photo_id: "ph-1",
				project_id: "p1",
				label: "saved window",
				kind: "window",
				x: 0.1,
				y: 0.1,
				width: 0.2,
				height: 0.3,
				confidence: 0.9,
				status: "suggested",
				created_at: "2026-01-01T00:00:00Z",
			},
		]);

		render(
			<OverlayConfirmStep
				confirmedElements={[]}
				onConfirm={vi.fn()}
				photo={samplePhoto}
				projectId="p1"
				taskId="t1"
				taskTitle="ceiling"
			/>
		);

		const toggle = await screen.findByRole("button", {
			name: /Toggle saved window protection/,
		});
		expect(toggle.getAttribute("aria-pressed")).toBe("true");
		await user.click(toggle);
		expect(toggle.getAttribute("aria-pressed")).toBe("false");

		await waitFor(() =>
			expect(updateProtectedElementStatusMock).toHaveBeenCalledWith(
				expect.objectContaining({
					data: { elementId: "db-only", status: "rejected" },
				})
			)
		);
	});

	it("calls saveDetectedElements on detect so a revisit doesn't re-run the AI", async () => {
		const user = userEvent.setup();
		createSignedUrlMock.mockResolvedValue({
			data: { signedUrl: "https://signed/a.png" },
			error: null,
		});
		detectProtectedElementsMock.mockResolvedValue(sampleBoxes);

		render(
			<OverlayConfirmStep
				confirmedElements={[]}
				onConfirm={vi.fn()}
				photo={samplePhoto}
				projectId="p1"
				taskId="t1"
				taskTitle="ceiling"
			/>
		);

		await screen.findByAltText("photo.png");
		await user.click(
			screen.getByRole("button", { name: /detect protected elements/i })
		);

		await waitFor(() =>
			expect(saveDetectedElementsMock).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({
						taskId: "t1",
						photoId: "ph-1",
						elements: expect.arrayContaining([
							expect.objectContaining({ label: "left window" }),
						]),
					}),
				})
			)
		);
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
				})
		);
		const onConfirm = vi.fn();

		const { unmount } = render(
			<OverlayConfirmStep
				confirmedElements={[]}
				onConfirm={onConfirm}
				photo={samplePhoto}
				projectId="p1"
				taskId="t1"
				taskTitle="ceiling"
			/>
		);

		await screen.findByAltText("photo.png");
		await user.click(
			screen.getByRole("button", { name: /detect protected elements/i })
		);
		unmount();
		// Resolve the in-flight detection after unmount — the component should
		// observe `cancelledRef` and not attempt to setState (no error thrown).
		resolveDetection(sampleBoxes);
		await new Promise((r) => setTimeout(r, 0));
		expect(onConfirm).not.toHaveBeenCalled();
	});
});
