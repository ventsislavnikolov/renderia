import { useEffect, useRef, useState } from "react";
import { DEFAULT_STYLE_ID } from "@/lib/ai/style-presets";
import {
	allPreviewsApproved,
	getAllProtectedElements,
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
import { getTaskStyle, setTaskStyle } from "../../server/tasks";
import { BriefStep } from "./brief-step";
import { GenerationStep } from "./generation-step";
import { LayoutPreviewStep } from "./layout-preview-step";
import { PhotoReviewStep } from "./photo-review-step";
import { PhotoUploadStep } from "./photo-upload-step";
import { type CompositeImage, RoomCompositeStep } from "./room-composite-step";
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
	"composite",
	"brief",
	"generate",
] as const;
type StepId = (typeof STEPS)[number];

const STEP_LABELS: Record<StepId, string> = {
	upload: "Upload",
	review: "Review",
	merge: "Merge",
	preview: "Preview",
	composite: "360",
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
	// Latest structural preview per reference photo angle, keyed by photo id.
	const [previews, setPreviews] = useState<Record<string, PreviewImage>>({});
	// Latest Room Composite (the "360 view") for the task, or null if unbuilt.
	const [composite, setComposite] = useState<CompositeImage | null>(null);
	const [brief, setBrief] = useState("");
	const [briefId, setBriefId] = useState<string | null>(null);
	const [prompt, setPrompt] = useState("");
	const [style, setStyle] = useState(DEFAULT_STYLE_ID);
	const [styleRules, setStyleRules] = useState(DEFAULT_STYLE_RULES);
	const [saveError, setSaveError] = useState<string | null>(null);
	const cancelledRef = useRef(false);
	const hasLoadedRoomStateRef = useRef(false);
	// Serializes autosaves: only one save request is in flight at a time. A state
	// change arriving mid-flight is recorded as pending and flushed once the
	// current request settles, so overlapping saves can't race each other in the
	// non-atomic delete-then-write on the server.
	const savingRef = useRef(false);
	const pendingStateRef = useRef<TaskRoomState | null>(null);

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
				const taskStyle = await getTaskStyle({
					data: { taskId: props.taskId },
					headers,
				});
				if (cancelledRef.current) return;
				if (taskStyle?.style) setStyle(taskStyle.style);
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
				setPreviews(loadedRoom.previews);
				setComposite(loadedRoom.composite);
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
			// Coalesce while a save is already running; the trailing flush below
			// picks up the latest state once the in-flight request settles.
			if (savingRef.current) {
				pendingStateRef.current = roomState;
				return;
			}
			savingRef.current = true;
			let stateToSave: TaskRoomState | null = roomState;
			try {
				while (stateToSave) {
					pendingStateRef.current = null;
					const headers = await getAuthHeaders();
					await saveTaskRoomState({
						data: { taskId: props.taskId, roomState: stateToSave },
						headers,
					});
					setSaveError(null);
					stateToSave = pendingStateRef.current;
				}
			} catch (caught) {
				if (
					caught instanceof Error &&
					caught.message === UNAUTHENTICATED_ERROR
				) {
					window.location.assign("/sign-in");
					return;
				}
				setSaveError(
					caught instanceof Error
						? caught.message
						: "Failed to save room review state"
				);
			} finally {
				savingRef.current = false;
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
	const compositeApproved = composite?.status === "approved";
	const reached: Record<StepId, boolean> = {
		upload: true,
		review: photos.length > 0 && roomState !== null,
		merge: reviewedAll,
		preview: reviewedAll,
		composite: roomState !== null && allPreviewsApproved(roomState),
		brief: compositeApproved,
		generate: compositeApproved && brief.length > 0,
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
				approvedPhotoIds: [],
			});
			setPreviews({});
			setComposite(null);
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

	// Persist the chosen Style to the Task. Optimistic: reflect the pick
	// immediately, fire-and-forget the write. A failed write is non-fatal — the
	// brief still generates against whatever Style the row holds; the user can
	// re-pick. Auth failures redirect, matching the other server calls here.
	async function handleStyleChange(nextStyle: string) {
		setStyle(nextStyle);
		try {
			const headers = await getAuthHeaders();
			await setTaskStyle({
				data: { taskId: props.taskId, style: nextStyle },
				headers,
			});
		} catch (caught) {
			if (caught instanceof Error && caught.message === UNAUTHENTICATED_ERROR) {
				window.location.assign("/sign-in");
			}
		}
	}

	// Keep local flow state in sync after a photo is deleted on the server. The
	// DB already cascades the removal; mirroring it here stops the autosave from
	// re-inserting a now-deleted photo id and drops any state that referenced it.
	function handlePhotoDeleted(photoId: string) {
		setPhotos((prev) => prev.filter((photo) => photo.id !== photoId));
		setRoomState((prev) => {
			if (!prev) return prev;
			const photoIds = prev.photoIds.filter((id) => id !== photoId);
			return {
				...prev,
				photoIds,
				reviewedPhotoIds: prev.reviewedPhotoIds.filter((id) => id !== photoId),
				referencePhotoId:
					prev.referencePhotoId === photoId ? null : prev.referencePhotoId,
				appearances: prev.appearances.filter(
					(appearance) => appearance.photoId !== photoId
				),
				approvedPhotoIds: prev.approvedPhotoIds.filter((id) => id !== photoId),
			};
		});
		setPreviews((prev) => {
			if (!(photoId in prev)) return prev;
			const { [photoId]: _removed, ...rest } = prev;
			return rest;
		});
		// The composite was synthesised from the prior angle set — drop it so the
		// user rebuilds it from the changed evidence.
		setComposite(null);
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

			{saveError ? (
				<p className="m-0 text-sm text-warning" role="alert">
					Saving your review state failed: {saveError}. Recent changes may be
					lost on refresh.
				</p>
			) : null}

			{step === "upload" ? (
				<PhotoUploadStep
					onPhotoDeleted={handlePhotoDeleted}
					onPhotosConfirmed={handlePhotosConfirmed}
					projectId={props.projectId}
					selectedPhotoIds={photos.map((photo) => photo.id)}
					taskId={props.taskId}
				/>
			) : null}

			{step === "review" && roomState ? (
				<PhotoReviewStep
					onContinue={() =>
						// With one photo there are no cross-angle objects to merge, so
						// jump straight to the preview. Merge stays reachable in the
						// stepper for optional preservation-mode edits.
						setStep(roomState.photoIds.length > 1 ? "merge" : "preview")
					}
					onInvalidatePreview={() => setPreviews({})}
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
					onInvalidatePreview={() => setPreviews({})}
					onStateChange={setRoomState}
					photos={photos}
					roomState={roomState}
				/>
			) : null}

			{step === "preview" && roomState ? (
				<LayoutPreviewStep
					onApproved={() => setStep("composite")}
					onPreviewGenerated={(photoId, image) =>
						setPreviews((prev) => ({ ...prev, [photoId]: image }))
					}
					onStateChange={setRoomState}
					photos={photos}
					previews={previews}
					roomState={roomState}
					taskId={props.taskId}
					taskTitle={props.taskTitle}
				/>
			) : null}

			{step === "composite" && roomState ? (
				<RoomCompositeStep
					composite={composite}
					onApproved={() => setStep("brief")}
					onCompositeChange={setComposite}
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
					onStyleChange={handleStyleChange}
					onStyleRulesChange={setStyleRules}
					prompt={prompt}
					protectedElements={getAllProtectedElements(roomState)}
					referencePhotoName={
						photos.find((photo) => photo.id === roomState.referencePhotoId)
							?.original_name
					}
					roomObjects={roomState.objects}
					style={style}
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
					compositeId={composite?.id ?? null}
					prompt={prompt}
					taskId={props.taskId}
				/>
			) : null}
		</section>
	);
}
