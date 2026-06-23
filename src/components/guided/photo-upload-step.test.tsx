import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Tables } from "@/lib/types/database";

vi.mock("@/lib/server-client/auth-headers", () => ({
	getAuthHeaders: () => Promise.resolve({}),
	UNAUTHENTICATED_ERROR: "UNAUTHENTICATED",
}));

const listProjectPhotos = vi.fn();
const createPhotoRecord = vi.fn();
vi.mock("@/server/photos", () => ({
	createPhotoRecord: (args: unknown) => createPhotoRecord(args),
	deletePhoto: vi.fn(),
	listProjectPhotos: (args: unknown) => listProjectPhotos(args),
}));

const getSessionMock = vi.fn();
const uploadMock = vi.fn();
const removeMock = vi.fn();
vi.mock("@/lib/supabase/browser", () => ({
	supabaseBrowser: {
		auth: { getSession: () => getSessionMock() },
		storage: {
			from: () => ({
				createSignedUrl: () =>
					Promise.resolve({
						data: { signedUrl: "https://example.test/photo.png" },
						error: null,
					}),
				upload: (...args: unknown[]) => uploadMock(...args),
				remove: (...args: unknown[]) => removeMock(...args),
			}),
		},
	},
}));

import { PhotoUploadStep } from "./photo-upload-step";

function makePhoto(overrides: Partial<Tables<"photos">>): Tables<"photos"> {
	return {
		id: "photo-1",
		original_name: "attic.jpg",
		content_type: "image/jpeg",
		created_at: "2026-06-14T00:00:00.000Z",
		storage_bucket: "source-photos",
		storage_path: "user/project/attic.jpg",
		...overrides,
	} as unknown as Tables<"photos">;
}

function makeFile(name: string, type = "image/png"): File {
	return new File(["data"], name, { type });
}

describe("PhotoUploadStep icon-only controls", () => {
	beforeEach(() => {
		listProjectPhotos.mockReset();
		listProjectPhotos.mockResolvedValue([makePhoto({})]);
	});

	it("gives the icon-only delete button an accessible name", async () => {
		render(<PhotoUploadStep projectId="project-1" taskId="task-1" />);

		// The button's only visible content is a lucide Trash2 icon (which lucide
		// renders `aria-hidden`), so its accessible name comes solely from the
		// aria-label — without it the control would be nameless to AT.
		const button = await screen.findByRole("button", {
			name: "Delete attic.jpg",
		});
		expect(button).toBeInTheDocument();

		const icon = button.querySelector("svg");
		expect(icon).not.toBeNull();
		expect(icon).toHaveAttribute("aria-hidden", "true");
	});
});

describe("PhotoUploadStep multi-upload", () => {
	beforeEach(() => {
		listProjectPhotos.mockReset();
		createPhotoRecord.mockReset();
		getSessionMock.mockReset();
		uploadMock.mockReset();
		removeMock.mockReset();

		listProjectPhotos.mockResolvedValue([]);
		getSessionMock.mockResolvedValue({
			data: { session: { user: { id: "user-1" } } },
		});
		uploadMock.mockResolvedValue({ error: null });
		removeMock.mockResolvedValue({ error: null });
		let seq = 0;
		createPhotoRecord.mockImplementation(
			({
				data,
			}: {
				data: {
					storagePath: string;
					originalName: string;
					contentType: string;
				};
			}) => {
				seq += 1;
				return Promise.resolve(
					makePhoto({
						id: `photo-${seq}`,
						original_name: data.originalName,
						content_type: data.contentType as Tables<"photos">["content_type"],
						storage_path: data.storagePath,
					})
				);
			}
		);
	});

	it("uploads a batch of files in one action and auto-selects them", async () => {
		const user = userEvent.setup();
		render(
			<PhotoUploadStep
				onPhotosConfirmed={vi.fn()}
				projectId="project-1"
				taskId="task-1"
			/>
		);
		// Wait for the empty initial load to settle.
		await screen.findByText(/no photos yet/i);

		const input = screen.getByLabelText("Choose photos to upload");
		await user.upload(input, [makeFile("a.png"), makeFile("b.png")]);

		await waitFor(() => expect(createPhotoRecord).toHaveBeenCalledTimes(2));
		// Both uploaded photos are auto-selected into the Room Set.
		expect(
			await screen.findByRole("button", { name: /continue with 2 photos/i })
		).toBeEnabled();
	});

	it("rejects the whole batch when it would exceed 4 photos", async () => {
		listProjectPhotos.mockResolvedValue([
			makePhoto({ id: "p1", original_name: "one.jpg" }),
			makePhoto({ id: "p2", original_name: "two.jpg" }),
		]);
		const user = userEvent.setup();
		render(
			<PhotoUploadStep
				onPhotosConfirmed={vi.fn()}
				projectId="project-1"
				taskId="task-1"
			/>
		);
		await screen.findByRole("button", { name: "Delete one.jpg" });

		const input = screen.getByLabelText("Choose photos to upload");
		await user.upload(input, [
			makeFile("a.png"),
			makeFile("b.png"),
			makeFile("c.png"),
			makeFile("d.png"),
		]);

		expect(await screen.findByRole("alert")).toHaveTextContent(/2 more|4 max/i);
		expect(createPhotoRecord).not.toHaveBeenCalled();
	});

	it("skips invalid files and uploads the valid ones", async () => {
		const user = userEvent.setup();
		render(
			<PhotoUploadStep
				onPhotosConfirmed={vi.fn()}
				projectId="project-1"
				taskId="task-1"
			/>
		);
		await screen.findByText(/no photos yet/i);

		const input = screen.getByLabelText("Choose photos to upload");
		// An over-10MB PNG passes the picker's `accept` filter but fails the
		// component's own size check, so it is skipped while the valid file uploads.
		const tooBig = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.png", {
			type: "image/png",
		});
		await user.upload(input, [makeFile("good.png"), tooBig]);

		await waitFor(() => expect(createPhotoRecord).toHaveBeenCalledTimes(1));
		expect(screen.getByRole("alert")).toHaveTextContent(/skipped/i);
	});

	it("keeps successes and offers retry when a file fails", async () => {
		uploadMock.mockReset();
		uploadMock
			.mockResolvedValueOnce({ error: null })
			.mockResolvedValueOnce({ error: { message: "network down" } });
		const user = userEvent.setup();
		render(
			<PhotoUploadStep
				onPhotosConfirmed={vi.fn()}
				projectId="project-1"
				taskId="task-1"
			/>
		);
		await screen.findByText(/no photos yet/i);

		const input = screen.getByLabelText("Choose photos to upload");
		await user.upload(input, [makeFile("ok.png"), makeFile("fail.png")]);

		// One file uploaded, the other shows a retry control.
		await waitFor(() => expect(createPhotoRecord).toHaveBeenCalledTimes(1));
		const retry = await screen.findByRole("button", { name: /retry/i });

		// Retrying with a now-healthy upload completes the second file.
		uploadMock.mockResolvedValue({ error: null });
		await user.click(retry);
		await waitFor(() => expect(createPhotoRecord).toHaveBeenCalledTimes(2));
		expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
	});
});
