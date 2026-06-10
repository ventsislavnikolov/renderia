import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

/**
 * Integration tests for the photo-review step's photo list: one row per
 * photo, clicking a row activates that photo, and the per-row button
 * toggles reviewed state.
 */

const { fromMock, getAuthHeadersMock, detectMock } = vi.hoisted(() => {
	const createSignedUrl = vi.fn(() =>
		Promise.resolve({ data: { signedUrl: "https://example.com/img.png" } })
	);
	return {
		fromMock: vi.fn(() => ({ createSignedUrl })),
		getAuthHeadersMock: vi.fn(() => Promise.resolve({})),
		detectMock: vi.fn(() => Promise.resolve([])),
	};
});

vi.mock("../../../../src/lib/supabase/browser", () => ({
	supabaseBrowser: { storage: { from: fromMock } },
}));

vi.mock("../../../../src/lib/server-client/auth-headers", () => ({
	getAuthHeaders: getAuthHeadersMock,
	UNAUTHENTICATED_ERROR: "UNAUTHENTICATED",
}));

vi.mock("../../../../src/server/generation", () => ({
	detectProtectedElements: detectMock,
}));

import { PhotoReviewStep } from "../../../../src/components/guided/photo-review-step";
import type { TaskRoomState } from "../../../../src/lib/renovation/room-state";

function photo(
	id: string,
	name: string
): Parameters<typeof PhotoReviewStep>[0]["photos"][number] {
	return {
		id,
		owner_id: "owner-1",
		project_id: "project-1",
		storage_bucket: "source-photos",
		storage_path: `owner/${id}.png`,
		original_name: name,
		content_type: "image/png",
		width: null,
		height: null,
		notes: null,
		created_at: "2026-01-01T00:00:00.000Z",
	};
}

const PHOTOS = [
	photo("photo-1", "first.png"),
	photo("photo-2", "second.png"),
	photo("photo-3", "third.png"),
	photo("photo-4", "fourth.png"),
];

function roomState(overrides?: Partial<TaskRoomState>): TaskRoomState {
	return {
		photoIds: PHOTOS.map((entry) => entry.id),
		reviewedPhotoIds: [],
		referencePhotoId: null,
		appearances: [],
		objects: [],
		previewApproved: false,
		...overrides,
	};
}

function renderStep(state = roomState()) {
	const onStateChange = vi.fn();
	render(
		<PhotoReviewStep
			onContinue={vi.fn()}
			onInvalidatePreview={vi.fn()}
			onStateChange={onStateChange}
			photos={PHOTOS}
			roomState={state}
			taskId="task-1"
			taskTitle="Demo task"
		/>
	);
	return { onStateChange };
}

describe("PhotoReviewStep photo list", () => {
	it("activates the clicked photo, including middle rows", async () => {
		const user = userEvent.setup();
		renderStep();

		await user.click(screen.getByRole("button", { name: /second\.png/i }));
		expect(
			screen.getByRole("heading", { level: 3, name: "second.png" })
		).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: /third\.png/i }));
		expect(
			screen.getByRole("heading", { level: 3, name: "third.png" })
		).toBeInTheDocument();
	});

	it("toggles reviewed state from the per-row button", async () => {
		const user = userEvent.setup();
		const { onStateChange } = renderStep(
			roomState({ reviewedPhotoIds: ["photo-1"] })
		);

		const rows = screen.getAllByRole("button", {
			name: /Mark this photo reviewed|Mark as needs review/i,
		});
		expect(rows).toHaveLength(4);

		await user.click(
			screen.getAllByRole("button", { name: /Mark this photo reviewed/i })[0]
		);
		expect(onStateChange).toHaveBeenCalledWith(
			expect.objectContaining({
				reviewedPhotoIds: ["photo-1", "photo-2"],
			})
		);

		await user.click(
			screen.getByRole("button", { name: /Mark as needs review/i })
		);
		expect(onStateChange).toHaveBeenCalledWith(
			expect.objectContaining({ reviewedPhotoIds: [] })
		);
	});
});
