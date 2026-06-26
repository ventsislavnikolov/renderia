import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { PhotoTile, type PhotoTileStatus } from "@/components/ui/photo-tile";
import type {
	RoomAppearance,
	TaskRoomState,
} from "@/lib/renovation/room-state";
import {
	autoAssignObjectIds,
	clampAppearanceBox,
	invalidatePreview,
	reconcileRoomObjects,
} from "@/lib/renovation/room-state";
import type { Tables } from "@/lib/types/database";
import {
	getAuthHeaders,
	UNAUTHENTICATED_ERROR,
} from "../../lib/server-client/auth-headers";
import { supabaseBrowser } from "../../lib/supabase/browser";
import { detectProtectedElements } from "../../server/generation";

type PhotoRow = Tables<"photos">;

const KIND_OPTIONS = [
	"window",
	"door",
	"radiator",
	"stairs",
	"column_beam",
	"built_in",
	"other",
] as const;
const SIGNED_URL_TTL_SECONDS = 600;

function randomAppearanceId(photoId: string) {
	return `${photoId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function upsertState(
	state: TaskRoomState,
	appearances: RoomAppearance[],
	reviewedPhotoIds = state.reviewedPhotoIds
) {
	const assigned = autoAssignObjectIds(appearances);
	return invalidatePreview({
		...state,
		reviewedPhotoIds,
		appearances: assigned,
		objects: reconcileRoomObjects(assigned, state.objects),
	});
}

export function PhotoReviewStep(props: {
	taskId: string;
	taskTitle: string;
	photos: PhotoRow[];
	roomState: TaskRoomState;
	onStateChange: (next: TaskRoomState) => void;
	onInvalidatePreview: () => void;
	onContinue: () => void;
}) {
	const [activePhotoId, setActivePhotoId] = useState<string | null>(
		props.photos[0]?.id ?? null
	);
	const [activeAppearanceId, setActiveAppearanceId] = useState<string | null>(
		null
	);
	const [detecting, setDetecting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [signedUrls, setSignedUrls] = useState<Map<string, string>>(
		() => new Map()
	);
	// Photo ids whose signed-URL mint failed — drives the tile's error fallback.
	const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set());
	const imageFrameRef = useRef<HTMLDivElement | null>(null);
	const dragRef = useRef<{
		id: string;
		mode: "move" | "resize";
		startX: number;
		startY: number;
		origin: Pick<RoomAppearance, "x" | "y" | "width" | "height">;
	} | null>(null);

	useEffect(() => {
		if (!activePhotoId && props.photos[0]) setActivePhotoId(props.photos[0].id);
	}, [activePhotoId, props.photos]);

	const activePhoto =
		props.photos.find((photo) => photo.id === activePhotoId) ??
		props.photos[0] ??
		null;
	const activeAppearances = props.roomState.appearances.filter(
		(entry) => entry.photoId === activePhoto?.id
	);
	const activeAppearance =
		activeAppearances.find((entry) => entry.id === activeAppearanceId) ??
		activeAppearances[0] ??
		null;
	const allReviewed = props.roomState.photoIds.every((photoId) =>
		props.roomState.reviewedPhotoIds.includes(photoId)
	);

	const activePhotoUrl = activePhoto
		? (signedUrls.get(activePhoto.id) ?? null)
		: null;
	const activePhotoStatus: PhotoTileStatus = activePhoto
		? failedIds.has(activePhoto.id)
			? "error"
			: activePhotoUrl
				? "ready"
				: "loading"
		: "loading";

	useEffect(() => {
		if (!activeAppearance && activeAppearances[0]) {
			setActiveAppearanceId(activeAppearances[0].id);
		}
	}, [activeAppearance, activeAppearances]);

	useEffect(() => {
		if (props.photos.length === 0) return;
		let cancelled = false;
		void (async () => {
			const results = await Promise.all(
				props.photos.map(async (photo) => {
					const signed = await supabaseBrowser.storage
						.from(photo.storage_bucket)
						.createSignedUrl(photo.storage_path, SIGNED_URL_TTL_SECONDS);
					return {
						id: photo.id,
						url:
							signed.error || !signed.data?.signedUrl
								? null
								: signed.data.signedUrl,
					};
				})
			);
			if (cancelled) return;
			setSignedUrls((prev) => {
				let changed = false;
				const next = new Map(prev);
				for (const entry of results) {
					if (entry.url && next.get(entry.id) !== entry.url) {
						next.set(entry.id, entry.url);
						changed = true;
					}
				}
				return changed ? next : prev;
			});
			setFailedIds((prev) => {
				let changed = false;
				const next = new Set(prev);
				for (const entry of results) {
					if (entry.url === null && !next.has(entry.id)) {
						next.add(entry.id);
						changed = true;
					}
				}
				return changed ? next : prev;
			});
		})();
		return () => {
			cancelled = true;
		};
	}, [props.photos]);

	const updateAppearance = useCallback(
		(appearanceId: string, patch: Partial<RoomAppearance>) => {
			const next = props.roomState.appearances.map((entry) =>
				entry.id === appearanceId
					? clampAppearanceBox({ ...entry, ...patch })
					: entry
			);
			props.onInvalidatePreview();
			props.onStateChange(upsertState(props.roomState, next));
		},
		[
			props.onInvalidatePreview,
			props.onStateChange,
			props.roomState,
			props.roomState.appearances,
			props.roomState.approvedPhotoIds,
		]
	);

	useEffect(() => {
		function handlePointerMove(event: PointerEvent) {
			if (!dragRef.current || !imageFrameRef.current) return;
			const rect = imageFrameRef.current.getBoundingClientRect();
			const deltaX = (event.clientX - dragRef.current.startX) / rect.width;
			const deltaY = (event.clientY - dragRef.current.startY) / rect.height;
			if (dragRef.current.mode === "move") {
				updateAppearance(dragRef.current.id, {
					x: Math.max(
						0,
						Math.min(
							1 - dragRef.current.origin.width,
							dragRef.current.origin.x + deltaX
						)
					),
					y: Math.max(
						0,
						Math.min(
							1 - dragRef.current.origin.height,
							dragRef.current.origin.y + deltaY
						)
					),
				});
				return;
			}
			updateAppearance(dragRef.current.id, {
				width: Math.max(
					0.04,
					Math.min(
						1 - dragRef.current.origin.x,
						dragRef.current.origin.width + deltaX
					)
				),
				height: Math.max(
					0.04,
					Math.min(
						1 - dragRef.current.origin.y,
						dragRef.current.origin.height + deltaY
					)
				),
			});
		}

		function handlePointerUp() {
			dragRef.current = null;
		}

		window.addEventListener("pointermove", handlePointerMove);
		window.addEventListener("pointerup", handlePointerUp);
		return () => {
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerup", handlePointerUp);
		};
	}, [updateAppearance]);

	async function runBatchDetection() {
		setDetecting(true);
		setError(null);
		try {
			const headers = await getAuthHeaders();
			const detectedByPhoto = await Promise.all(
				props.photos.map(async (photo) => {
					const response = (await detectProtectedElements({
						data: {
							photoId: photo.id,
							taskId: props.taskId,
							taskTitle: props.taskTitle,
						},
						headers,
					})) as
						| Array<{
								label: string;
								kind: RoomAppearance["kind"];
								x: number;
								y: number;
								width: number;
								height: number;
								confidence?: number;
						  }>
						| {
								data: Array<{
									label: string;
									kind: RoomAppearance["kind"];
									x: number;
									y: number;
									width: number;
									height: number;
									confidence?: number;
								}>;
						  };
					const boxes = Array.isArray(response) ? response : response.data;
					return boxes.map((box): RoomAppearance => {
						const clamped = clampAppearanceBox(box);
						return {
							id: randomAppearanceId(photo.id),
							photoId: photo.id,
							label: box.label,
							kind: box.kind,
							x: clamped.x,
							y: clamped.y,
							width: clamped.width,
							height: clamped.height,
							confidence: box.confidence ?? null,
							source: "ai",
							objectId: null,
						};
					});
				})
			);
			const manual = props.roomState.appearances.filter(
				(entry) => entry.source === "manual"
			);
			props.onStateChange(
				upsertState(props.roomState, [...manual, ...detectedByPhoto.flat()])
			);
		} catch (caught) {
			if (caught instanceof Error && caught.message === UNAUTHENTICATED_ERROR) {
				window.location.assign("/auth");
				return;
			}
			setError(
				caught instanceof Error ? caught.message : "Failed to detect objects"
			);
		} finally {
			setDetecting(false);
		}
	}

	function removeAppearance(appearanceId: string) {
		const next = props.roomState.appearances.filter(
			(entry) => entry.id !== appearanceId
		);
		props.onInvalidatePreview();
		props.onStateChange(upsertState(props.roomState, next));
	}

	function addManualAppearance() {
		if (!activePhoto) return;
		const next = [
			...props.roomState.appearances,
			{
				id: randomAppearanceId(activePhoto.id),
				photoId: activePhoto.id,
				label: "new fixed element",
				kind: "other" as const,
				x: 0.1,
				y: 0.1,
				width: 0.2,
				height: 0.2,
				confidence: null,
				source: "manual" as const,
				objectId: null,
			},
		];
		props.onInvalidatePreview();
		props.onStateChange(upsertState(props.roomState, next));
	}

	function toggleReviewed(photoId: string) {
		const reviewedPhotoIds = props.roomState.reviewedPhotoIds.includes(photoId)
			? props.roomState.reviewedPhotoIds.filter((id) => id !== photoId)
			: [...props.roomState.reviewedPhotoIds, photoId];
		props.onStateChange(
			upsertState(
				props.roomState,
				props.roomState.appearances,
				reviewedPhotoIds
			)
		);
	}

	function startDrag(
		event: {
			preventDefault(): void;
			stopPropagation(): void;
			clientX: number;
			clientY: number;
		},
		entry: RoomAppearance,
		mode: "move" | "resize"
	) {
		event.preventDefault();
		event.stopPropagation();
		dragRef.current = {
			id: entry.id,
			mode,
			startX: event.clientX,
			startY: event.clientY,
			origin: {
				x: entry.x,
				y: entry.y,
				width: entry.width,
				height: entry.height,
			},
		};
		setActiveAppearanceId(entry.id);
	}

	const appearanceSummary = useMemo(
		() =>
			activeAppearance
				? `${activeAppearance.label} (${activeAppearance.kind})`
				: "No active selection",
		[activeAppearance]
	);

	return (
		<div className="grid gap-6 border border-border bg-surface p-10 max-md:p-6">
			<header className="flex flex-wrap items-start justify-between gap-4">
				<div className="grid gap-2">
					<h2 className="m-0 font-display font-medium text-2xl text-foreground tracking-tight">
						2. Review each uploaded photo
					</h2>
					<p className="m-0 max-w-[68ch] font-body text-[0.9375rem] text-ink-muted leading-relaxed">
						Run AI detection across all uploaded photos, then review each angle.
						You can add, edit, or remove fixed elements manually.
					</p>
				</div>
				{allReviewed ? (
					<Button onClick={props.onContinue} type="button">
						Continue to structural preview
					</Button>
				) : null}
			</header>

			<div className="flex flex-wrap items-center gap-3">
				<Button
					disabled={detecting || props.photos.length === 0}
					onClick={() => void runBatchDetection()}
					type="button"
				>
					{detecting
						? "Detecting…"
						: props.photos.length > 1
							? "Detect all photos"
							: "Detect photo"}
				</Button>
				<Button onClick={addManualAppearance} type="button" variant="outline">
					Add manual object
				</Button>
				{error ? (
					<p className="m-0 text-sm text-warning" role="alert">
						{error}
					</p>
				) : null}
			</div>

			<div className="grid gap-3">
				{props.photos.map((photo) => {
					const reviewed = props.roomState.reviewedPhotoIds.includes(photo.id);
					return (
						<div
							className="flex flex-wrap items-center justify-between gap-3 rounded border border-border px-3 py-2"
							key={photo.id}
						>
							<button
								className="flex-1 cursor-pointer self-stretch text-left text-sm"
								onClick={() => setActivePhotoId(photo.id)}
								type="button"
							>
								<div className="font-medium text-foreground">
									{photo.original_name}
								</div>
								<div className="text-ink-muted">
									{reviewed ? "Reviewed" : "Needs review"}
								</div>
							</button>
							<Button
								onClick={() => toggleReviewed(photo.id)}
								size="sm"
								type="button"
								variant="outline"
							>
								{reviewed ? "Mark as needs review" : "Mark this photo reviewed"}
							</Button>
						</div>
					);
				})}
			</div>

			{activePhoto ? (
				<section className="grid gap-4">
					<h3 className="m-0 font-display text-foreground text-lg">
						{activePhoto.original_name}
					</h3>
					<div className="grid gap-3">
						<div className="grid gap-3">
							<div
								className="relative overflow-hidden rounded border border-border bg-background"
								ref={imageFrameRef}
							>
								<PhotoTile
									alt={activePhoto.original_name}
									className="aspect-[4/3] w-full"
									imageClassName="object-contain"
									status={activePhotoStatus}
									url={activePhotoUrl}
								/>
								{activeAppearances.map((entry) => {
									const isSelected = entry.id === activeAppearanceId;
									const color =
										entry.objectId &&
										props.roomState.objects.find(
											(object) => object.id === entry.objectId
										)?.preservationMode === "keep_type_restyle"
											? "border-sky-500 bg-sky-500/10"
											: "border-red-500 bg-red-500/10";
									return (
										<button
											aria-label={`Edit ${entry.label}`}
											className={`absolute border-2 ${color} ${isSelected ? "shadow-[0_0_0_2px_rgba(255,255,255,0.7)]" : ""}`}
											key={entry.id}
											onClick={() => setActiveAppearanceId(entry.id)}
											onPointerDown={(event) => startDrag(event, entry, "move")}
											style={{
												left: `${entry.x * 100}%`,
												top: `${entry.y * 100}%`,
												width: `${entry.width * 100}%`,
												height: `${entry.height * 100}%`,
											}}
											type="button"
										>
											<span className="absolute top-1 left-1 rounded bg-background/85 px-1 py-0.5 text-[10px] text-foreground">
												{entry.label}
											</span>
											<span
												className="absolute right-0 bottom-0 h-3 w-3 cursor-se-resize rounded-tl bg-background/85"
												onPointerDown={(event) =>
													startDrag(event, entry, "resize")
												}
											/>
										</button>
									);
								})}
							</div>
							<p className="m-0 text-ink-muted text-sm">
								Drag a box to move it. Drag the bottom-right handle to resize.
								Selected object: {appearanceSummary}.
							</p>
						</div>
					</div>
					{activeAppearances.length === 0 ? (
						<p className="m-0 text-ink-muted text-sm">
							No persisted objects yet. You can mark this angle as having no
							persisted objects, or add one manually.
						</p>
					) : null}
					<ul className="m-0 grid list-none gap-4 p-0">
						{activeAppearances.map((entry) => (
							<li
								className="grid gap-3 rounded border border-border p-4"
								key={entry.id}
							>
								<div className="grid gap-2 md:grid-cols-2">
									<label className="grid gap-1 text-sm">
										<span>Label</span>
										<input
											className="rounded border border-border bg-background px-3 py-2"
											onChange={(event) =>
												updateAppearance(entry.id, {
													label: event.target.value,
												})
											}
											value={entry.label}
										/>
									</label>
									<label className="grid gap-1 text-sm">
										<span>Kind</span>
										<select
											className="rounded border border-border bg-background px-3 py-2 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
											onChange={(event) =>
												updateAppearance(entry.id, {
													kind: event.target.value as RoomAppearance["kind"],
												})
											}
											value={entry.kind}
										>
											{KIND_OPTIONS.map((kind) => (
												<option key={kind} value={kind}>
													{kind}
												</option>
											))}
										</select>
									</label>
								</div>
								<div className="grid gap-2 md:grid-cols-4">
									{(["x", "y", "width", "height"] as const).map((field) => (
										<label className="grid gap-1 text-sm" key={field}>
											<span>{field}</span>
											<input
												className="rounded border border-border bg-background px-3 py-2"
												max={1}
												min={0}
												onChange={(event) =>
													updateAppearance(entry.id, {
														[field]: Number(event.target.value),
													} as Partial<RoomAppearance>)
												}
												step={0.01}
												type="number"
												value={entry[field]}
											/>
										</label>
									))}
								</div>
								<div className="flex flex-wrap items-center gap-3 text-ink-muted text-sm">
									<span>Source: {entry.source}</span>
									<span>Confidence: {entry.confidence ?? "manual"}</span>
									<Button
										onClick={() => removeAppearance(entry.id)}
										size="sm"
										type="button"
										variant="outline"
									>
										Remove
									</Button>
								</div>
							</li>
						))}
					</ul>
				</section>
			) : null}
		</div>
	);
}
