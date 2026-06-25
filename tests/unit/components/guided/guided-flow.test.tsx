import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	getAuthHeadersMock,
	loadLatestDesignBriefMock,
	listProjectPhotosMock,
	loadTaskRoomStateMock,
	saveTaskRoomStateMock,
} = vi.hoisted(() => ({
	getAuthHeadersMock: vi.fn(),
	loadLatestDesignBriefMock: vi.fn(),
	listProjectPhotosMock: vi.fn(),
	loadTaskRoomStateMock: vi.fn(),
	saveTaskRoomStateMock: vi.fn(),
}));

vi.mock("../../../../src/lib/server-client/auth-headers", () => ({
	UNAUTHENTICATED_ERROR: "UNAUTHENTICATED",
	getAuthHeaders: (...args: unknown[]) => getAuthHeadersMock(...args),
}));

vi.mock("../../../../src/server/generation", () => ({
	loadLatestDesignBrief: (...args: unknown[]) =>
		loadLatestDesignBriefMock(...args),
}));

vi.mock("../../../../src/server/photos", () => ({
	listProjectPhotos: (...args: unknown[]) => listProjectPhotosMock(...args),
}));

vi.mock("../../../../src/server/room-state", () => ({
	loadTaskRoomState: (...args: unknown[]) => loadTaskRoomStateMock(...args),
	saveTaskRoomState: (...args: unknown[]) => saveTaskRoomStateMock(...args),
}));

vi.mock("../../../../src/components/guided/photo-upload-step", () => ({
	PhotoUploadStep: (props: {
		selectedPhotoIds: string[];
		onPhotosConfirmed: (
			rows: Array<{
				id: string;
				owner_id: string;
				project_id: string;
				storage_bucket: "source-photos";
				storage_path: string;
				original_name: string;
				content_type: string;
				width: number | null;
				height: number | null;
				notes: string | null;
				created_at: string;
			}>
		) => void;
	}) => (
		<div data-testid="photo-step">
			<span data-testid="selected-photo-count">
				{props.selectedPhotoIds.length}
			</span>
			<button
				onClick={() =>
					props.onPhotosConfirmed([
						{
							id: "ph-1",
							owner_id: "user-1",
							project_id: "p1",
							storage_bucket: "source-photos",
							storage_path: "user-1/one.png",
							original_name: "one.png",
							content_type: "image/png",
							width: null,
							height: null,
							notes: null,
							created_at: "2026-01-01T00:00:00Z",
						},
						{
							id: "ph-2",
							owner_id: "user-1",
							project_id: "p1",
							storage_bucket: "source-photos",
							storage_path: "user-1/two.png",
							original_name: "two.png",
							content_type: "image/png",
							width: null,
							height: null,
							notes: null,
							created_at: "2026-01-02T00:00:00Z",
						},
					])
				}
				type="button"
			>
				confirm-photos
			</button>
		</div>
	),
}));

vi.mock("../../../../src/components/guided/photo-review-step", () => ({
	PhotoReviewStep: (props: {
		roomState: {
			reviewedPhotoIds: string[];
			photoIds: string[];
			appearances: Array<{
				id: string;
				photoId: string;
				label: string;
				kind: string;
			}>;
		};
		onStateChange: (next: unknown) => void;
		onContinue: () => void;
	}) => (
		<div data-testid="review-step">
			<span data-testid="reviewed-photo-count">
				{props.roomState.reviewedPhotoIds.length}
			</span>
			<button
				onClick={() => {
					props.onStateChange({
						...props.roomState,
						reviewedPhotoIds: props.roomState.photoIds,
						appearances: [
							{
								id: "app-1",
								photoId: "ph-1",
								label: "main door",
								kind: "door",
								x: 0.1,
								y: 0.2,
								width: 0.15,
								height: 0.3,
								confidence: 0.9,
								source: "ai",
								objectId: "obj-1",
							},
						],
					});
					props.onContinue();
				}}
				type="button"
			>
				review-all-photos
			</button>
		</div>
	),
}));

vi.mock("../../../../src/components/guided/layout-preview-step", () => ({
	LayoutPreviewStep: (props: {
		roomState: {
			approvedPhotoIds: string[];
			photoIds: string[];
			referencePhotoId: string | null;
		};
		onStateChange: (next: unknown) => void;
		onApproved: () => void;
	}) => (
		<div data-testid="preview-step">
			<span data-testid="preview-approved-count">
				{props.roomState.approvedPhotoIds.length}
			</span>
			<button
				onClick={() => {
					props.onStateChange({
						...props.roomState,
						referencePhotoId: "ph-2",
						approvedPhotoIds: props.roomState.photoIds,
					});
					props.onApproved();
				}}
				type="button"
			>
				approve-preview
			</button>
		</div>
	),
}));

vi.mock("../../../../src/components/guided/room-review-step", () => ({
	RoomReviewStep: (props: { onNext: () => void }) => (
		<div data-testid="room-step">
			<button onClick={props.onNext} type="button">
				continue-to-brief
			</button>
		</div>
	),
}));

vi.mock("../../../../src/components/guided/brief-step", () => ({
	BriefStep: (props: {
		brief: string;
		prompt: string;
		onBriefChange: (brief: string) => void;
		onBriefIdChange: (briefId: string | null) => void;
		onPromptChange: (prompt: string) => void;
		onNext: () => void;
	}) => (
		<div data-testid="brief-step">
			<span data-testid="brief-value">{props.brief}</span>
			<button
				onClick={() => {
					props.onBriefChange("# room brief");
					props.onBriefIdChange("brief-1");
					props.onPromptChange("APPROVED ROOM OBJECTS");
				}}
				type="button"
			>
				generate-brief
			</button>
			<button onClick={props.onNext} type="button">
				continue-to-generate
			</button>
		</div>
	),
}));

vi.mock("../../../../src/components/guided/generation-step", () => ({
	GenerationStep: (props: { briefId: string | null; prompt: string }) => (
		<div data-testid="generation-step">
			<span data-testid="generation-brief-id">{props.briefId ?? "null"}</span>
			<span data-testid="generation-prompt">{props.prompt}</span>
		</div>
	),
}));

import { GuidedFlow } from "../../../../src/components/guided/guided-flow";

describe("GuidedFlow orchestrator", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getAuthHeadersMock.mockResolvedValue({
			Authorization: "Bearer test-token",
		});
		loadLatestDesignBriefMock.mockResolvedValue(null);
		listProjectPhotosMock.mockResolvedValue([]);
		loadTaskRoomStateMock.mockResolvedValue({
			roomState: {
				photoIds: [],
				reviewedPhotoIds: [],
				referencePhotoId: null,
				appearances: [],
				objects: [],
				approvedPhotoIds: [],
			},
			preview: null,
			composite: null,
		});
		saveTaskRoomStateMock.mockResolvedValue({ ok: true });
	});

	it("starts on the Upload step with the six-step workflow gated", () => {
		render(<GuidedFlow projectId="p1" taskId="t1" taskTitle="ceiling" />);
		const stepper = screen.getByRole("navigation", {
			name: /guided renovation steps/i,
		});
		const buttons = within(stepper).getAllByRole("button");
		expect(buttons).toHaveLength(6);
		expect(buttons[0]?.textContent).toMatch(/Upload/i);
		expect(buttons[1]?.textContent).toMatch(/Review/i);
		expect(buttons[2]?.textContent).toMatch(/Preview/i);
		expect(buttons[3]?.textContent).toMatch(/Room/i);
		expect(buttons[4]?.textContent).toMatch(/Brief/i);
		expect(buttons[5]?.textContent).toMatch(/Generate/i);
		expect(buttons[0]?.getAttribute("aria-current")).toBe("step");
		expect(buttons[1]?.hasAttribute("disabled")).toBe(true);
		expect(buttons[5]?.hasAttribute("disabled")).toBe(true);
	});

	it("advances upload → review → preview → room → brief → generate", async () => {
		const user = userEvent.setup();
		render(<GuidedFlow projectId="p1" taskId="t1" taskTitle="ceiling" />);

		await user.click(screen.getByText("confirm-photos"));
		expect(screen.getByTestId("review-step")).toBeDefined();

		await user.click(screen.getByText("review-all-photos"));
		expect(screen.getByTestId("preview-step")).toBeDefined();

		// Approving every angle unlocks the read-only room review step.
		await user.click(screen.getByText("approve-preview"));
		expect(screen.getByTestId("room-step")).toBeDefined();

		await user.click(screen.getByText("continue-to-brief"));
		expect(screen.getByTestId("brief-step")).toBeDefined();

		await user.click(screen.getByText("generate-brief"));
		await user.click(screen.getByText("continue-to-generate"));

		const generation = screen.getByTestId("generation-step");
		expect(
			within(generation).getByTestId("generation-brief-id").textContent
		).toBe("brief-1");
		expect(
			within(generation).getByTestId("generation-prompt").textContent
		).toBe("APPROVED ROOM OBJECTS");
	});
});
