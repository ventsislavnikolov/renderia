import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Integration tests for the guided flow orchestrator.
 *
 * The plan (Task 9) called for a Playwright e2e spec, but the workspace has
 * no live Supabase session in local test runs (`SUPABASE_SECRET_KEY` is empty
 * in `.env.local`) and the magic-link sign-in flow is impractical to drive
 * from headless tests. We mock the child step components at the module
 * boundary so we can drive the orchestrator deterministically and assert its
 * gating, reachability, downstream reset, and step transitions without the
 * heavy machinery of Playwright + a fake Supabase backend.
 *
 * Each child step gets its own dedicated test file that mocks the network
 * boundaries (Supabase storage, server fns, auth headers). See:
 *   - tests/unit/components/guided/photo-upload-step.test.tsx
 *   - tests/unit/components/guided/overlay-confirm-step.test.tsx
 *   - tests/unit/components/guided/brief-step.test.tsx
 */

// Mock each step with a tiny shim that exposes a callable button for the
// transitions we care about. Real-step behavior lives in their own tests.
vi.mock("../../../../src/components/guided/photo-upload-step", () => ({
	PhotoUploadStep: (props: {
		projectId: string;
		selectedPhotoId: string | null;
		onPhotoSelected: (row: {
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
		}) => void;
	}) => (
		<div data-testid="photo-step">
			<span data-testid="photo-step-selected">
				{props.selectedPhotoId ?? "none"}
			</span>
			<button
				type="button"
				onClick={() =>
					props.onPhotoSelected({
						id: "ph-1",
						owner_id: "user-1",
						project_id: props.projectId,
						storage_bucket: "source-photos",
						storage_path: "user-1/photo.png",
						original_name: "photo.png",
						content_type: "image/png",
						width: null,
						height: null,
						notes: null,
						created_at: "2026-01-01T00:00:00Z",
					})
				}
			>
				select-photo
			</button>
			<button
				type="button"
				onClick={() =>
					props.onPhotoSelected({
						id: "ph-2",
						owner_id: "user-1",
						project_id: props.projectId,
						storage_bucket: "source-photos",
						storage_path: "user-1/other.png",
						original_name: "other.png",
						content_type: "image/png",
						width: null,
						height: null,
						notes: null,
						created_at: "2026-01-02T00:00:00Z",
					})
				}
			>
				select-other-photo
			</button>
		</div>
	),
}));

vi.mock("../../../../src/components/guided/overlay-confirm-step", () => ({
	OverlayConfirmStep: (props: {
		confirmedElements: Array<{
			label: string;
			kind: string;
			x: number;
			y: number;
			width: number;
			height: number;
		}>;
		onConfirm: (
			elements: Array<{
				label: string;
				kind:
					| "window"
					| "door"
					| "stairs"
					| "ceiling_line"
					| "wall_edge"
					| "structure"
					| "other";
				x: number;
				y: number;
				width: number;
				height: number;
			}>,
		) => void;
	}) => (
		<div data-testid="overlay-step">
			<span data-testid="overlay-inbound-count">
				{props.confirmedElements.length}
			</span>
			<button
				type="button"
				onClick={() =>
					props.onConfirm([
						{
							label: "left window",
							kind: "window",
							x: 0.1,
							y: 0.2,
							width: 0.2,
							height: 0.3,
						},
					])
				}
			>
				confirm-elements
			</button>
		</div>
	),
}));

vi.mock("../../../../src/components/guided/brief-step", () => ({
	BriefStep: (props: {
		brief: string;
		prompt: string;
		onBriefChange: (brief: string) => void;
		onPromptChange: (prompt: string) => void;
		onNext: () => void;
	}) => (
		<div data-testid="brief-step">
			<span data-testid="brief-value">{props.brief}</span>
			<span data-testid="prompt-value">{props.prompt}</span>
			<button
				type="button"
				onClick={() => {
					props.onBriefChange("# brief");
					props.onPromptChange("PRESERVE EXACTLY");
				}}
			>
				generate-brief
			</button>
			<button type="button" onClick={props.onNext}>
				continue-to-generate
			</button>
		</div>
	),
}));

vi.mock("../../../../src/components/guided/generation-step", () => ({
	GenerationStep: (props: { brief: string; prompt: string }) => (
		<div data-testid="generation-step">
			<span data-testid="generation-brief">{props.brief}</span>
			<span data-testid="generation-prompt">{props.prompt}</span>
		</div>
	),
}));

import { GuidedFlow } from "../../../../src/components/guided/guided-flow";

describe("GuidedFlow orchestrator", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("starts on the Upload step with downstream steps disabled", () => {
		render(<GuidedFlow projectId="p1" taskTitle="ceiling" />);
		const stepper = screen.getByRole("navigation", {
			name: /guided renovation steps/i,
		});
		const buttons = within(stepper).getAllByRole("button");
		// Plan originally listed 5 stepper entries (Upload, Detect, Confirm,
		// Brief, Generate); Task 8 merged Detect into Confirm (the "Detect"
		// label had no component body). The orchestrator now exposes 4.
		expect(buttons).toHaveLength(4);
		expect(buttons[0]?.textContent).toMatch(/Upload/i);
		expect(buttons[1]?.textContent).toMatch(/Confirm/i);
		expect(buttons[2]?.textContent).toMatch(/Brief/i);
		expect(buttons[3]?.textContent).toMatch(/Generate/i);
		expect(buttons[0]?.getAttribute("aria-current")).toBe("step");
		// Downstream steps unreachable without a selected photo.
		expect(buttons[1]?.hasAttribute("disabled")).toBe(true);
		expect(buttons[2]?.hasAttribute("disabled")).toBe(true);
		expect(buttons[3]?.hasAttribute("disabled")).toBe(true);
		expect(screen.getByTestId("photo-step")).toBeDefined();
	});

	it("advances to the overlay step when a photo is selected", async () => {
		const user = userEvent.setup();
		render(<GuidedFlow projectId="p1" taskTitle="ceiling" />);
		await user.click(screen.getByText("select-photo"));
		expect(screen.getByTestId("overlay-step")).toBeDefined();
		// Confirm step is now reachable in the stepper.
		const stepper = screen.getByRole("navigation", {
			name: /guided renovation steps/i,
		});
		const overlayButton = within(stepper).getByRole("button", {
			name: /Confirm/i,
		});
		expect(overlayButton.hasAttribute("disabled")).toBe(false);
		expect(overlayButton.getAttribute("aria-current")).toBe("step");
	});

	it("advances through confirm → brief → generate, exposing prompt + brief to the final step", async () => {
		const user = userEvent.setup();
		render(<GuidedFlow projectId="p1" taskTitle="ceiling" />);
		await user.click(screen.getByText("select-photo"));
		await user.click(screen.getByText("confirm-elements"));
		expect(screen.getByTestId("brief-step")).toBeDefined();
		await user.click(screen.getByText("generate-brief"));
		expect(screen.getByTestId("brief-value").textContent).toBe("# brief");
		await user.click(screen.getByText("continue-to-generate"));
		const generation = screen.getByTestId("generation-step");
		expect(
			within(generation).getByTestId("generation-brief").textContent,
		).toBe("# brief");
		expect(
			within(generation).getByTestId("generation-prompt").textContent,
		).toBe("PRESERVE EXACTLY");
	});

	it("resets downstream state when a different photo is selected", async () => {
		const user = userEvent.setup();
		render(<GuidedFlow projectId="p1" taskTitle="ceiling" />);
		// Walk all the way to generate so brief + protected elements are set.
		await user.click(screen.getByText("select-photo"));
		await user.click(screen.getByText("confirm-elements"));
		await user.click(screen.getByText("generate-brief"));
		await user.click(screen.getByText("continue-to-generate"));
		expect(screen.getByTestId("generation-step")).toBeDefined();

		// Jump back to photo step using the stepper and pick a different photo.
		const stepper = screen.getByRole("navigation", {
			name: /guided renovation steps/i,
		});
		await user.click(within(stepper).getByRole("button", { name: /Upload/i }));
		await user.click(screen.getByText("select-other-photo"));

		// Overlay step gets no inbound elements (downstream state was reset).
		expect(screen.getByTestId("overlay-inbound-count").textContent).toBe("0");
		// And brief/generate are gated again until elements + brief land.
		const buttons = within(stepper).getAllByRole("button");
		expect(buttons[2]?.hasAttribute("disabled")).toBe(true);
		expect(buttons[3]?.hasAttribute("disabled")).toBe(true);
	});

	it("ignores stepper clicks on unreachable steps", async () => {
		const user = userEvent.setup();
		render(<GuidedFlow projectId="p1" taskTitle="ceiling" />);
		const stepper = screen.getByRole("navigation", {
			name: /guided renovation steps/i,
		});
		const generateButton = within(stepper).getByRole("button", {
			name: /Generate/i,
		});
		// Disabled buttons swallow clicks; the photo step should still be active.
		await user.click(generateButton).catch(() => undefined);
		expect(screen.getByTestId("photo-step")).toBeDefined();
	});
});
