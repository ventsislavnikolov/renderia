import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RoomMergeStep } from "../../../../src/components/guided/room-merge-step";
import type {
	RoomAppearance,
	RoomObject,
	TaskRoomState,
} from "../../../../src/lib/renovation/room-state";

const samplePhoto = {
	id: "ph-1",
	owner_id: "user-1",
	project_id: "p1",
	storage_bucket: "source-photos" as const,
	storage_path: "user-1/living.png",
	original_name: "living.png",
	content_type: "image/png",
	width: null,
	height: null,
	notes: null,
	created_at: "2026-01-01T00:00:00Z",
};

// A self-consistent room state: one appearance already assigned to one object
// whose label equals the normalized appearance label, so the component's
// auto-assign/reconcile effect is a no-op and doesn't churn state.
const appearance: RoomAppearance = {
	id: "app-1",
	photoId: "ph-1",
	label: "left window",
	kind: "window",
	x: 0.1,
	y: 0.2,
	width: 0.2,
	height: 0.3,
	confidence: 0.9,
	source: "ai",
	objectId: "window:left-window",
};

const object: RoomObject = {
	id: "window:left-window",
	label: "left window",
	kind: "window",
	preservationMode: "exact_preserve",
	appearanceIds: ["app-1"],
	isPersisted: true,
};

const roomState: TaskRoomState = {
	photoIds: ["ph-1"],
	reviewedPhotoIds: ["ph-1"],
	referencePhotoId: "ph-1",
	appearances: [appearance],
	objects: [object],
	previewApproved: false,
};

function renderStep() {
	return render(
		<RoomMergeStep
			onContinue={vi.fn()}
			onInvalidatePreview={vi.fn()}
			onStateChange={vi.fn()}
			photos={[samplePhoto]}
			roomState={roomState}
		/>
	);
}

describe("RoomMergeStep", () => {
	it("gives the per-object Mode select an accessible name", () => {
		renderStep();
		expect(screen.getByRole("combobox", { name: /mode/i })).toBeTruthy();
	});

	it("labels the appearance-reassignment select with its appearance and photo", () => {
		renderStep();
		// Icon-/text-adjacent native selects are otherwise nameless to a screen
		// reader: this one sits next to a plain <div>, not a <label>. It must
		// carry an explicit accessible name describing what it reassigns.
		const select = screen.getByRole("combobox", {
			name: /room object for left window in living\.png/i,
		});
		expect(select).toBeTruthy();
	});
});
