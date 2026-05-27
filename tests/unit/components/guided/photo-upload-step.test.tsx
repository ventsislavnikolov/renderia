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
 * Integration tests for the photo-upload step.
 *
 * Mocks the network boundary (Supabase storage SDK + server fns + auth
 * headers) at the module level so the component can be driven end-to-end
 * without real Supabase credentials. The HIGH-2 fix from Task 8 review —
 * calling `storage.remove()` to clean up orphaned uploads when
 * `createPhotoRecord` fails — is asserted explicitly.
 */

// `supabaseBrowser` lives at module load — mock both `auth.getSession` (used
// to derive the storage path prefix) and `storage.from(...)` (upload +
// remove). `vi.hoisted` lets the factories below reference shared mocks
// without tripping the "no top-level variables in vi.mock factories" rule.
const {
	getSessionMock,
	uploadMock,
	removeMock,
	createSignedUrlMock,
	fromMock,
	listProjectPhotosMock,
	createPhotoRecordMock,
	getAuthHeadersMock,
} = vi.hoisted(() => {
	const upload = vi.fn();
	const remove = vi.fn();
	const createSignedUrl = vi.fn();
	return {
		getSessionMock: vi.fn(),
		uploadMock: upload,
		removeMock: remove,
		createSignedUrlMock: createSignedUrl,
		fromMock: vi.fn(() => ({ upload, remove, createSignedUrl })),
		listProjectPhotosMock: vi.fn(),
		createPhotoRecordMock: vi.fn(),
		getAuthHeadersMock: vi.fn(),
	};
});

vi.mock("../../../../src/lib/supabase/browser", () => ({
	supabaseBrowser: {
		auth: { getSession: getSessionMock },
		storage: { from: fromMock },
	},
}));

vi.mock("../../../../src/server/photos", () => ({
	listProjectPhotos: (...args: unknown[]) => listProjectPhotosMock(...args),
	createPhotoRecord: (...args: unknown[]) => createPhotoRecordMock(...args),
}));

vi.mock("../../../../src/lib/server-client/auth-headers", () => ({
	UNAUTHENTICATED_ERROR: "UNAUTHENTICATED",
	getAuthHeaders: (...args: unknown[]) => getAuthHeadersMock(...args),
}));

import { PhotoUploadStep } from "../../../../src/components/guided/photo-upload-step";

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

// `Object.assign(window, ...)` keeps `window.location` writable for the
// redirect-on-unauth tests. JSDOM normally locks it down.
const originalLocation = window.location;

beforeEach(() => {
	getSessionMock.mockReset();
	uploadMock.mockReset();
	removeMock.mockReset().mockResolvedValue({ data: [], error: null });
	createSignedUrlMock.mockReset().mockResolvedValue({
		data: { signedUrl: "https://signed/preview.png" },
		error: null,
	});
	fromMock.mockClear();
	listProjectPhotosMock.mockReset();
	createPhotoRecordMock.mockReset();
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

function pickFile(input: HTMLElement, file: File) {
	// userEvent.upload works but is fussy with the visually-hidden input here;
	// drive the change event directly so the assertion stays focused.
	const fileInput = input as HTMLInputElement;
	Object.defineProperty(fileInput, "files", {
		configurable: true,
		value: { 0: file, length: 1, item: (i: number) => (i === 0 ? file : null) },
	});
	fileInput.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("PhotoUploadStep", () => {
	it("renders the existing photo list once the server fn resolves", async () => {
		listProjectPhotosMock.mockResolvedValueOnce([samplePhoto]);
		render(
			<PhotoUploadStep
				onPhotoSelected={vi.fn()}
				projectId="p1"
				selectedPhotoId={null}
			/>
		);

		const tile = await screen.findByRole("button", { name: /photo\.png/ });
		expect(tile).toBeDefined();
		expect(listProjectPhotosMock).toHaveBeenCalledWith({
			data: { projectId: "p1" },
			headers: { Authorization: "Bearer test-token" },
		});
	});

	it("uploads via userEvent.upload — guards against label-pattern refactors (MED-2)", async () => {
		// The `pickFile` helper in this file dispatches a raw `change` event,
		// which bypasses React's synthetic-event normalisation and would keep
		// passing even if the visually-hidden input were re-wired through a
		// different label or trigger. Drive the full label→input flow via
		// `user.upload` so a refactor that breaks the hidden input pairing
		// fails this assertion.
		listProjectPhotosMock
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([samplePhoto]);
		getSessionMock.mockResolvedValue({
			data: { session: { user: { id: "user-1" } } },
		});
		uploadMock.mockResolvedValue({ data: { path: "ok" }, error: null });
		createPhotoRecordMock.mockResolvedValue(samplePhoto);
		const onPhotoSelected = vi.fn();
		const user = userEvent.setup();

		render(
			<PhotoUploadStep
				onPhotoSelected={onPhotoSelected}
				projectId="p1"
				selectedPhotoId={null}
			/>
		);

		const hiddenInput = (await screen.findByLabelText(
			/choose a photo to upload/i
		)) as HTMLInputElement;
		const file = new File([new Uint8Array([1, 2, 3])], "photo.png", {
			type: "image/png",
		});
		await user.upload(hiddenInput, file);

		await waitFor(() => expect(onPhotoSelected).toHaveBeenCalledTimes(1));
		expect(onPhotoSelected).toHaveBeenCalledWith(samplePhoto);
		expect(uploadMock).toHaveBeenCalledTimes(1);
	});

	it("uploads a valid PNG and notifies the parent with the inserted row", async () => {
		// First refresh (on mount) returns empty; the post-upload refresh sees
		// the new row so the photo list re-renders with the new tile.
		listProjectPhotosMock
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([samplePhoto]);
		getSessionMock.mockResolvedValue({
			data: { session: { user: { id: "user-1" } } },
		});
		uploadMock.mockResolvedValue({ data: { path: "ok" }, error: null });
		createPhotoRecordMock.mockResolvedValue(samplePhoto);
		const onPhotoSelected = vi.fn();

		render(
			<PhotoUploadStep
				onPhotoSelected={onPhotoSelected}
				projectId="p1"
				selectedPhotoId={null}
			/>
		);

		const hiddenInput = await screen.findByLabelText(
			/choose a photo to upload/i
		);
		const file = new File([new Uint8Array([1, 2, 3])], "photo.png", {
			type: "image/png",
		});
		pickFile(hiddenInput, file);

		await waitFor(() => expect(onPhotoSelected).toHaveBeenCalledTimes(1));
		expect(onPhotoSelected).toHaveBeenCalledWith(samplePhoto);
		expect(fromMock).toHaveBeenCalledWith("source-photos");
		const uploadCall = uploadMock.mock.calls[0];
		expect(uploadCall?.[0]).toMatch(/^user-1\/\d+-photo\.png$/);
		expect(createPhotoRecordMock).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					projectId: "p1",
					originalName: "photo.png",
					contentType: "image/png",
				}),
			})
		);
	});

	it("rejects unsupported MIME types without calling storage or the server fn", async () => {
		listProjectPhotosMock.mockResolvedValue([]);
		render(
			<PhotoUploadStep
				onPhotoSelected={vi.fn()}
				projectId="p1"
				selectedPhotoId={null}
			/>
		);

		const hiddenInput = await screen.findByLabelText(
			/choose a photo to upload/i
		);
		const badFile = new File(["nope"], "diagram.gif", { type: "image/gif" });
		pickFile(hiddenInput, badFile);

		expect(
			await screen.findByText(/Use a PNG, JPEG, or WEBP image/i)
		).toBeDefined();
		expect(uploadMock).not.toHaveBeenCalled();
		expect(createPhotoRecordMock).not.toHaveBeenCalled();
	});

	it("removes the orphaned storage object when createPhotoRecord throws (HIGH-2 fix)", async () => {
		listProjectPhotosMock.mockResolvedValue([]);
		getSessionMock.mockResolvedValue({
			data: { session: { user: { id: "user-1" } } },
		});
		uploadMock.mockResolvedValue({ data: { path: "ok" }, error: null });
		createPhotoRecordMock.mockRejectedValue(new Error("Database error"));

		render(
			<PhotoUploadStep
				onPhotoSelected={vi.fn()}
				projectId="p1"
				selectedPhotoId={null}
			/>
		);

		const hiddenInput = await screen.findByLabelText(
			/choose a photo to upload/i
		);
		const file = new File([new Uint8Array([1, 2, 3])], "photo.png", {
			type: "image/png",
		});
		pickFile(hiddenInput, file);

		await waitFor(() => expect(removeMock).toHaveBeenCalledTimes(1));
		const removedPaths = removeMock.mock.calls[0]?.[0] as string[];
		expect(removedPaths?.[0]).toMatch(/^user-1\/\d+-photo\.png$/);
		// Original error is surfaced to the user, not the cleanup error.
		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toMatch(/Database error/);
	});

	it("redirects to /auth when there is no Supabase session", async () => {
		listProjectPhotosMock.mockResolvedValue([]);
		getSessionMock.mockResolvedValue({ data: { session: null } });
		const assignSpy = window.location.assign as unknown as Mock;

		render(
			<PhotoUploadStep
				onPhotoSelected={vi.fn()}
				projectId="p1"
				selectedPhotoId={null}
			/>
		);

		const hiddenInput = await screen.findByLabelText(
			/choose a photo to upload/i
		);
		const file = new File([new Uint8Array([1, 2, 3])], "photo.png", {
			type: "image/png",
		});
		pickFile(hiddenInput, file);

		await waitFor(() => expect(assignSpy).toHaveBeenCalledWith("/auth"));
		expect(uploadMock).not.toHaveBeenCalled();
	});

	it("redirects to /auth when listProjectPhotos surfaces UNAUTHENTICATED (Task 7 fix)", async () => {
		listProjectPhotosMock.mockRejectedValueOnce(new Error("UNAUTHENTICATED"));
		const assignSpy = window.location.assign as unknown as Mock;

		render(
			<PhotoUploadStep
				onPhotoSelected={vi.fn()}
				projectId="p1"
				selectedPhotoId={null}
			/>
		);

		await waitFor(() => expect(assignSpy).toHaveBeenCalledWith("/auth"));
	});
});
