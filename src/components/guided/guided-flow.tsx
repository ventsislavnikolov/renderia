import { useEffect, useRef, useState } from "react";
import {
	getReferenceProtectedElements,
	type TaskRoomState,
} from "@/lib/renovation/room-state";
import type { Tables } from "@/lib/types/database";
import { cn } from "@/lib/utils";
import {
	getAuthHeaders,
	UNAUTHENTICATED_ERROR,
} from "../../lib/server-client/auth-headers";
import { loadLatestDesignBrief } from "../../server/generation";
import { listProjectPhotos } from "../../server/photos";
import { loadTaskRoomState, saveTaskRoomState } from "../../server/room-state";
import { BriefStep } from "./brief-step";
import { GenerationStep } from "./generation-step";
import { LayoutPreviewStep } from "./layout-preview-step";
import { PhotoReviewStep } from "./photo-review-step";
import { PhotoUploadStep } from "./photo-upload-step";
import { RoomMergeStep } from "./room-merge-step";

const DEFAULT_STYLE_RULES =
	"Scandinavian renovation style with warm neutral palette.";

type PhotoRow = Tables<"photos">;
type PreviewImage = { id: string; signedUrl: string };

/**
 * Step identifiers in render order. Using a typed tuple lets the stepper UI
 * iterate without losing the discriminated-union benefits of `currentStep`.
 */
const STEPS = [
	"upload",
	"review",
	"merge",
	"preview",
	"brief",
	"generate",
] as const;
type StepId = (typeof STEPS)[number];

const STEP_LABELS: Record<StepId, string> = {
	upload: "Upload",
	review: "Review",
	merge: "Merge",
	preview: "Preview",
	brief: "Brief",
	generate: "Generate",
};

/**
 * Orchestrates the guided renovation workspace.
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
	const [step, setStep] = useState<StepId>("upload");
	const [photos, setPhotos] = useState<PhotoRow[]>([]);
	const [roomState, setRoomState] = useState<TaskRoomState | null>(null);
	const [preview, setPreview] = useState<PreviewImage | null>(null);
	const [brief, setBrief] = useState("");
	const [briefId, setBriefId] = useState<string | null>(null);
	const [prompt, setPrompt] = useState("");
	const [styleRules, setStyleRules] = useState(DEFAULT_STYLE_RULES);
	const cancelledRef = useRef(false);
	const hasLoadedRoomStateRef = useRef(false);

	// Rehydrate the latest persisted brief for this task so the user doesn't
	// lose their edited markdown when they reopen the workspace. Photo and
	// overlay state aren't restored — they're cheap to re-confirm and gating
	// the brief textarea behind a re-upload is safer than trusting stale
	// detections against a possibly-changed source image.
	useEffect(() => {
		cancelledRef.current = false;
		(async () => {
			try {
				const headers = await getAuthHeaders();
				const loaded = await loadLatestDesignBrief({
					data: { taskId: props.taskId },
					headers,
				});
				if (cancelledRef.current || !loaded) return;
				setBrief(loaded.markdown);
				setBriefId(loaded.id);
				setPrompt(loaded.prompt);
				if (loaded.styleRules) setStyleRules(loaded.styleRules);
			} catch (caught) {
				if (cancelledRef.current) return;
				if (
					caught instanceof Error &&
					caught.message === UNAUTHENTICATED_ERROR
				) {
					window.location.assign("/sign-in");
				}
				// Silent on other errors — the user can still generate a fresh brief.
			}
		})();
		return () => {
			cancelledRef.current = true;
		};
	}, [props.taskId]);

	useEffect(() => {
		cancelledRef.current = false;
		(async () => {
			try {
				const headers = await getAuthHeaders();
				const loadedRoom = await loadTaskRoomState({
					data: { taskId: props.taskId },
					headers,
				});
				const projectPhotos = (await listProjectPhotos({
					data: { projectId: props.projectId, taskId: props.taskId },
					headers,
				})) as PhotoRow[];
				if (cancelledRef.current) return;
				setRoomState(loadedRoom.roomState);
				setPreview(loadedRoom.preview);
				hasLoadedRoomStateRef.current = true;
				setPhotos(
					projectPhotos.filter((photo) =>
						loadedRoom.roomState.photoIds.includes(photo.id)
					)
				);
			} catch (caught) {
				if (cancelledRef.current) return;
				if (
					caught instanceof Error &&
					caught.message === UNAUTHENTICATED_ERROR
				) {
					window.location.assign("/sign-in");
				}
			}
		})();
		return () => {
			cancelledRef.current = true;
		};
	}, [props.projectId, props.taskId]);

	useEffect(() => {
		if (!roomState) return;
		if (hasLoadedRoomStateRef.current) {
			hasLoadedRoomStateRef.current = false;
			return;
		}
		const timer = window.setTimeout(async () => {
			try {
				const headers = await getAuthHeaders();
				await saveTaskRoomState({
					data: { taskId: props.taskId, roomState },
					headers,
				});
			} catch (caught) {
				if (
					caught instanceof Error &&
					caught.message === UNAUTHENTICATED_ERROR
				) {
					window.location.assign("/sign-in");
				}
			}
		}, 250);
		return () => window.clearTimeout(timer);
	}, [props.taskId, roomState]);

	const reviewedAll =
		roomState !== null &&
		roomState.photoIds.length > 0 &&
		roomState.photoIds.every((photoId) =>
			roomState.reviewedPhotoIds.includes(photoId)
		);
	const reached: Record<StepId, boolean> = {
		upload: true,
		review: photos.length > 0 && roomState !== null,
		merge: reviewedAll,
		preview: reviewedAll,
		brief: roomState?.previewApproved === true,
		generate: roomState?.previewApproved === true && brief.length > 0,
	};

	function goTo(target: StepId) {
		if (!reached[target]) return;
		setStep(target);
	}

	function handlePhotosConfirmed(rows: PhotoRow[]) {
		const nextPhotoIds = rows.map((row) => row.id);
		const sameSelection =
			roomState !== null &&
			roomState.photoIds.length === nextPhotoIds.length &&
			roomState.photoIds.every(
				(photoId, index) => photoId === nextPhotoIds[index]
			);
		setPhotos(rows);
		if (!sameSelection) {
			setRoomState({
				photoIds: nextPhotoIds,
				reviewedPhotoIds: [],
				referencePhotoId: null,
				appearances: [],
				objects: [],
				previewApproved: false,
			});
			setPreview(null);
			setBrief("");
			setBriefId(null);
			setPrompt("");
		}
		setStep("review");
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
								]
							)}
							disabled={!isReachable}
							key={id}
							onClick={() => goTo(id)}
							type="button"
						>
							<span
								className={cn(
									"font-display font-medium text-[0.8125rem] tracking-[0.02em] [font-feature-settings:'tnum'] [font-variation-settings:'opsz'_9]",
									isCurrent ? "text-foreground" : "text-ink-subtle"
								)}
							>
								{String(index + 1).padStart(2, "0")}
							</span>
							<span
								aria-hidden="true"
								className={cn(
									"font-display text-[0.8125rem]",
									isCurrent ? "text-foreground" : "text-ink-subtle opacity-60"
								)}
							>
								/
							</span>
							<span
								className={cn(
									"font-body text-[0.9375rem] tracking-tight",
									isCurrent ? "font-semibold" : "font-medium"
								)}
							>
								{STEP_LABELS[id]}
							</span>
						</button>
					);
				})}
			</nav>

			{step === "upload" ? (
				<PhotoUploadStep
					onPhotosConfirmed={handlePhotosConfirmed}
					projectId={props.projectId}
					taskId={props.taskId}
					selectedPhotoIds={photos.map((photo) => photo.id)}
				/>
			) : null}

			{step === "review" && roomState ? (
				<PhotoReviewStep
					onContinue={() => setStep("merge")}
					onInvalidatePreview={() => setPreview(null)}
					onStateChange={setRoomState}
					photos={photos}
					roomState={roomState}
					taskId={props.taskId}
					taskTitle={props.taskTitle}
				/>
			) : null}

			{step === "merge" && roomState ? (
				<RoomMergeStep
					onContinue={() => setStep("preview")}
					onInvalidatePreview={() => setPreview(null)}
					onStateChange={setRoomState}
					photos={photos}
					roomState={roomState}
				/>
			) : null}

			{step === "preview" && roomState ? (
				<LayoutPreviewStep
					initialPreview={preview}
					onApproved={() => setStep("brief")}
					onPreviewChange={setPreview}
					onStateChange={setRoomState}
					photos={photos}
					roomState={roomState}
					taskId={props.taskId}
					taskTitle={props.taskTitle}
				/>
			) : null}

			{step === "brief" && roomState ? (
				<BriefStep
					brief={brief}
					onBriefChange={handleBriefChange}
					onBriefIdChange={setBriefId}
					onNext={() => setStep("generate")}
					onPromptChange={setPrompt}
					onStyleRulesChange={setStyleRules}
					prompt={prompt}
					protectedElements={getReferenceProtectedElements(roomState)}
					referencePhotoName={
						photos.find((photo) => photo.id === roomState.referencePhotoId)
							?.original_name
					}
					roomObjects={roomState.objects}
					styleRules={styleRules}
					supportingPhotoCount={photos.length}
					taskId={props.taskId}
					taskTitle={props.taskTitle}
				/>
			) : null}

			{step === "generate" && roomState ? (
				<GenerationStep
					brief={brief}
					briefId={briefId}
					photoId={roomState.referencePhotoId}
					prompt={prompt}
					taskId={props.taskId}
				/>
			) : null}
		</section>
	);
}
