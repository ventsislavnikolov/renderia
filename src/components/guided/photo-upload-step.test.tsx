import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Tables } from "@/lib/types/database";

vi.mock("@/lib/server-client/auth-headers", () => ({
	getAuthHeaders: () => Promise.resolve({}),
	UNAUTHENTICATED_ERROR: "UNAUTHENTICATED",
}));

const listProjectPhotos = vi.fn();
vi.mock("@/server/photos", () => ({
	createPhotoRecord: vi.fn(),
	deletePhoto: vi.fn(),
	listProjectPhotos: (args: unknown) => listProjectPhotos(args),
}));

vi.mock("@/lib/supabase/browser", () => ({
	supabaseBrowser: {
		auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
		storage: {
			from: () => ({
				createSignedUrl: () =>
					Promise.resolve({
						data: { signedUrl: "https://example.test/photo.png" },
						error: null,
					}),
			}),
		},
	},
}));

import { PhotoUploadStep } from "./photo-upload-step";

const photo = {
	id: "photo-1",
	original_name: "attic.jpg",
	content_type: "image/jpeg",
	created_at: "2026-06-14T00:00:00.000Z",
	storage_bucket: "photos",
	storage_path: "user/project/attic.jpg",
} as unknown as Tables<"photos">;

describe("PhotoUploadStep icon-only controls", () => {
	beforeEach(() => {
		listProjectPhotos.mockReset();
		listProjectPhotos.mockResolvedValue([photo]);
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
