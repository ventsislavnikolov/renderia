import { useState } from "react";
import type { BoundingBox } from "../../lib/ai/types";
import type { Tables } from "../../lib/types/database";
import { BriefStep } from "./brief-step";
import { GenerationStep } from "./generation-step";
import { OverlayConfirmStep } from "./overlay-confirm-step";
import { PhotoUploadStep } from "./photo-upload-step";

type PhotoRow = Tables<"photos">;

/**
 * Step identifiers in render order. Using a typed tuple lets the stepper UI
 * iterate without losing the discriminated-union benefits of `currentStep`.
 */
const STEPS = ["photo", "overlay", "brief", "generate"] as const;
type StepId = (typeof STEPS)[number];

const STEP_LABELS: Record<StepId, string> = {
	photo: "Upload",
	overlay: "Confirm",
	brief: "Brief",
	generate: "Generate",
};

/**
 * Orchestrates the 4-step guided renovation workspace.
 *
 * State is kept entirely in this component — no router search params, no
 * server persistence — because the plan documents persistence as a follow-up
 * task. Each child step is autonomous: it owns its own data lifecycle and
 * only calls `setStep` to advance the parent.
 *
 * The stepper exposes manual navigation but disables steps whose prerequisite
 * data isn't ready (e.g. overlay step needs a photo, brief step needs
 * confirmed elements) so the user can't render a half-wired child.
 */
export function GuidedFlow(props: {
	projectId: string;
	taskId: string;
	taskTitle: string;
}) {
	const [step, setStep] = useState<StepId>("photo");
	const [photo, setPhoto] = useState<PhotoRow | null>(null);
	const [protectedElements, setProtectedElements] = useState<BoundingBox[]>([]);
	const [brief, setBrief] = useState("");
	const [prompt, setPrompt] = useState("");

	const reached: Record<StepId, boolean> = {
		photo: true,
		overlay: photo !== null,
		brief: photo !== null && protectedElements.length > 0,
		generate: brief.length > 0,
	};

	function goTo(target: StepId) {
		if (!reached[target]) return;
		setStep(target);
	}

	function handlePhotoSelected(row: PhotoRow) {
		setPhoto(row);
		// Reset downstream state when the source photo changes so stale
		// detections never leak into a new run.
		if (photo?.id !== row.id) {
			setProtectedElements([]);
			setBrief("");
			setPrompt("");
		}
		setStep("overlay");
	}

	function handleElementsConfirmed(elements: BoundingBox[]) {
		setProtectedElements(elements);
		setStep("brief");
	}

	return (
		<section className="guided-flow" aria-label="Guided renovation flow">
			<nav className="stepper" aria-label="Guided renovation steps">
				{STEPS.map((id, index) => {
					const isCurrent = id === step;
					const isReachable = reached[id];
					return (
						<button
							key={id}
							type="button"
							className={`stepper-item${isCurrent ? " active" : ""}`}
							onClick={() => goTo(id)}
							disabled={!isReachable}
							aria-current={isCurrent ? "step" : undefined}
						>
							<span className="step-number">
								{String(index + 1).padStart(2, "0")}
							</span>
							<span className="step-label">{STEP_LABELS[id]}</span>
						</button>
					);
				})}
			</nav>

			{step === "photo" ? (
				<PhotoUploadStep
					projectId={props.projectId}
					selectedPhotoId={photo?.id ?? null}
					onPhotoSelected={handlePhotoSelected}
				/>
			) : null}

			{step === "overlay" && photo ? (
				<OverlayConfirmStep
					projectId={props.projectId}
					taskId={props.taskId}
					photo={photo}
					taskTitle={props.taskTitle}
					confirmedElements={protectedElements}
					onConfirm={handleElementsConfirmed}
				/>
			) : null}

			{step === "brief" && photo ? (
				<BriefStep
					taskTitle={props.taskTitle}
					protectedElements={protectedElements}
					brief={brief}
					prompt={prompt}
					onBriefChange={setBrief}
					onPromptChange={setPrompt}
					onNext={() => setStep("generate")}
				/>
			) : null}

			{step === "generate" ? (
				<GenerationStep
					taskId={props.taskId}
					briefId={null}
					brief={brief}
					prompt={prompt}
				/>
			) : null}
		</section>
	);
}
