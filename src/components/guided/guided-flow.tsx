import { useState } from "react";
import type { BoundingBox } from "@/lib/ai/types";
import type { Tables } from "@/lib/types/database";
import { cn } from "@/lib/utils";
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
 * Transient flow state is kept in this component — no router search params.
 * Child steps own their data lifecycle and only call `setStep` to advance the
 * parent. Persisted rows, such as generated briefs, are passed through by id
 * so downstream server functions can keep a traceable foreign-key chain.
 *
 * The stepper exposes manual navigation but disables steps whose prerequisite
 * data isn't ready so the user can't render a half-wired child.
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
	const [briefId, setBriefId] = useState<string | null>(null);
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
			setBriefId(null);
			setPrompt("");
		}
		setStep("overlay");
	}

	function handleElementsConfirmed(elements: BoundingBox[]) {
		setProtectedElements(elements);
		setStep("brief");
	}

	function handleBriefChange(nextBrief: string) {
		setBrief(nextBrief);
		setBriefId(null);
	}

	return (
		<section aria-label="Guided renovation flow" className="grid gap-10">
			<nav
				aria-label="Guided renovation steps"
				className="flex flex-nowrap overflow-x-auto overflow-y-hidden border-border border-y max-md:flex-wrap max-md:overflow-x-visible"
			>
				{STEPS.map((id, index) => {
					const isCurrent = id === step;
					const isReachable = reached[id];
					return (
						<button
							aria-current={isCurrent ? "step" : undefined}
							className={cn(
								"relative inline-flex flex-1 items-baseline gap-2 border-border border-r px-5 py-4 text-left transition-colors",
								"font-body text-ink-muted",
								"hover:not-disabled:text-foreground",
								"disabled:cursor-not-allowed disabled:opacity-40",
								"last:border-r-0",
								"max-md:min-w-[50%] max-md:basis-1/2 max-md:border-border max-md:border-b",
								"max-md:nth-2n:border-r-0",
								isCurrent && [
									"text-foreground",
									"after:absolute after:right-5 after:bottom-[-1px] after:left-5 after:h-0.5 after:bg-foreground after:content-['']",
								],
							)}
							disabled={!isReachable}
							key={id}
							onClick={() => goTo(id)}
							type="button"
						>
							<span
								className={cn(
									"font-display font-medium text-[0.8125rem] tracking-[0.02em] [font-feature-settings:'tnum'] [font-variation-settings:'opsz'_9]",
									isCurrent ? "text-foreground" : "text-ink-subtle",
								)}
							>
								{String(index + 1).padStart(2, "0")}
							</span>
							<span
								aria-hidden="true"
								className={cn(
									"font-display text-[0.8125rem]",
									isCurrent ? "text-foreground" : "text-ink-subtle opacity-60",
								)}
							>
								/
							</span>
							<span
								className={cn(
									"font-body text-[0.9375rem] tracking-tight",
									isCurrent ? "font-semibold" : "font-medium",
								)}
							>
								{STEP_LABELS[id]}
							</span>
						</button>
					);
				})}
			</nav>

			{step === "photo" ? (
				<PhotoUploadStep
					onPhotoSelected={handlePhotoSelected}
					projectId={props.projectId}
					selectedPhotoId={photo?.id ?? null}
				/>
			) : null}

			{step === "overlay" && photo ? (
				<OverlayConfirmStep
					confirmedElements={protectedElements}
					onConfirm={handleElementsConfirmed}
					photo={photo}
					projectId={props.projectId}
					taskId={props.taskId}
					taskTitle={props.taskTitle}
				/>
			) : null}

			{step === "brief" && photo ? (
				<BriefStep
					brief={brief}
					onBriefChange={handleBriefChange}
					onBriefIdChange={setBriefId}
					onNext={() => setStep("generate")}
					onPromptChange={setPrompt}
					prompt={prompt}
					protectedElements={protectedElements}
					taskId={props.taskId}
					taskTitle={props.taskTitle}
				/>
			) : null}

			{step === "generate" ? (
				<GenerationStep
					brief={brief}
					briefId={briefId}
					photoId={photo?.id ?? null}
					prompt={prompt}
					taskId={props.taskId}
				/>
			) : null}
		</section>
	);
}
