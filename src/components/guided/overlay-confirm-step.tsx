import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { PhotoTile } from "@/components/ui/photo-tile";
import { DEFAULT_TEXT_MODEL, type ModelSelection } from "@/lib/ai/models";
import type { BoundingBox, ProviderDebug } from "@/lib/ai/types";
import { cn } from "@/lib/utils";
import {
	getAuthHeaders,
	UNAUTHENTICATED_ERROR,
} from "../../lib/server-client/auth-headers";
import { supabaseBrowser } from "../../lib/supabase/browser";
import type { Tables } from "../../lib/types/database";
import {
	detectProtectedElements,
	listProtectedElements,
	type ProtectedElementRow,
	saveDetectedElements,
	updateProtectedElementStatus,
} from "../../server/generation";
import { ModelPicker } from "../ui/model-picker";
import { DebugPanel } from "./debug-panel";

type PhotoRow = Tables<"photos">;

/**
 * Signed URLs from Supabase Storage are short-lived; we re-mint them whenever
 * the user revisits the step. 10 minutes is enough for one detection call
 * plus a few minutes of overlay review without surprising the user with a
 * forced refresh.
 */
const SIGNED_URL_TTL_SECONDS = 600;

/**
 * Step 2 of the guided flow: detect and confirm protected elements.
 *
 * Mints a short-lived signed URL for the source photo, asks the AI provider
 * (via the `detectProtectedElements` server fn) for bounding boxes, then
 * renders them over the photo. The user can deselect individual boxes; only
 * the selected set is forwarded to the next step.
 *
 * Persistence: on mount we call `listProtectedElements` for the current
 * (task, photo) pair so previously-detected boxes survive navigation away
 * and back. The expensive OpenAI call only happens when the user explicitly
 * clicks "Detect protected elements" (or "Re-run detection"). Toggling a
 * box flips the row's `status` via `updateProtectedElementStatus` so the
 * persisted state always matches what the user sees.
 */

/**
 * Each rendered element carries the persisted DB row so toggle calls can
 * reference the real uuid. `box` is the projection used for rendering and
 * the confirm callback; `row` is the source of truth for persistence.
 */
type KeyedElement = {
	id: string;
	box: BoundingBox;
	row: ProtectedElementRow | null;
};

/**
 * `crypto.randomUUID` is undefined on non-HTTPS origins (e.g. LAN device
 * testing via `http://192.168.x.x`). The fallback keeps ids stable enough for
 * client-side React keys + selection sets without pulling in a UUID dep.
 */
function randomId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}
	return `elem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function rowToKeyed(row: ProtectedElementRow): KeyedElement {
	return {
		id: row.id,
		row,
		box: {
			label: row.label,
			kind: row.kind as BoundingBox["kind"],
			x: Number(row.x),
			y: Number(row.y),
			width: Number(row.width),
			height: Number(row.height),
			confidence: row.confidence ?? undefined,
		},
	};
}

export function OverlayConfirmStep(props: {
	projectId: string;
	taskId: string;
	photo: PhotoRow;
	taskTitle: string;
	confirmedElements: BoundingBox[];
	onConfirm: (elements: BoundingBox[]) => void;
}) {
	const [signedUrl, setSignedUrl] = useState<string | null>(null);
	const [elements, setElements] = useState<KeyedElement[] | null>(null);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [loadError, setLoadError] = useState<string | null>(null);
	const [detectError, setDetectError] = useState<string | null>(null);
	const [detecting, setDetecting] = useState(false);
	const [loadingPersisted, setLoadingPersisted] = useState(true);
	const [debug, setDebug] = useState<ProviderDebug | null>(null);
	const [model, setModel] = useState<ModelSelection>(DEFAULT_TEXT_MODEL);
	const cancelledRef = useRef(false);

	const mintUrl = useCallback(async () => {
		if (cancelledRef.current) return;
		setLoadError(null);
		try {
			const { data, error } = await supabaseBrowser.storage
				.from(photoBucketFor(props.photo))
				.createSignedUrl(props.photo.storage_path, SIGNED_URL_TTL_SECONDS);
			if (error) throw error;
			if (cancelledRef.current) return;
			setSignedUrl(data.signedUrl);
		} catch (error) {
			if (cancelledRef.current) return;
			setLoadError(
				error instanceof Error ? error.message : "Failed to load photo"
			);
		}
	}, [props.photo]);

	const loadPersisted = useCallback(async () => {
		if (cancelledRef.current) return;
		setLoadingPersisted(true);
		try {
			const headers = await getAuthHeaders();
			const rows = (await listProtectedElements({
				data: { taskId: props.taskId, photoId: props.photo.id },
				headers,
			})) as ProtectedElementRow[];
			if (cancelledRef.current) return;
			if (rows.length > 0) {
				const keyed = rows.map(rowToKeyed);
				setElements(keyed);
				// Suggested + confirmed both count as "selected" — only an
				// explicit reject takes the row out of the selection set.
				setSelected(
					new Set(
						keyed
							.filter(({ row }) => row?.status !== "rejected")
							.map(({ id }) => id)
					)
				);
			}
		} catch (error) {
			if (cancelledRef.current) return;
			if (error instanceof Error && error.message === UNAUTHENTICATED_ERROR) {
				window.location.assign("/sign-in");
				return;
			}
			// Failing to load persisted rows is non-fatal — the user can run
			// detection manually. We don't surface this in the alert region
			// to avoid noise on the happy path where the row set is empty.
			console.warn("Failed to load persisted protected elements", error);
		} finally {
			if (!cancelledRef.current) setLoadingPersisted(false);
		}
	}, [props.taskId, props.photo.id]);

	useEffect(() => {
		cancelledRef.current = false;
		setSignedUrl(null);
		setElements(null);
		setSelected(new Set());
		setDetectError(null);
		setDebug(null);
		void mintUrl();
		void loadPersisted();
		return () => {
			cancelledRef.current = true;
		};
	}, [mintUrl, loadPersisted]);

	async function runDetection() {
		if (!signedUrl) return;
		setDetectError(null);
		setDetecting(true);
		try {
			const headers = await getAuthHeaders();
			// Server fns now return `{ data, debug? }`. The legacy bare-array
			// shape is also accepted so older snapshots in tests still work
			// (and so a future plain endpoint can opt out of the wrapper).
			const response = (await detectProtectedElements({
				data: {
					photoId: props.photo.id,
					taskId: props.taskId,
					taskTitle: props.taskTitle,
					model,
				},
				headers,
			})) as BoundingBox[] | { data: BoundingBox[]; debug?: ProviderDebug };
			if (cancelledRef.current) return;
			const detectedBoxes: BoundingBox[] = Array.isArray(response)
				? response
				: response.data;
			const responseDebug: ProviderDebug | undefined = Array.isArray(response)
				? undefined
				: response.debug;

			// Persist immediately so re-visits don't burn another OpenAI call.
			// The save handler deletes existing rows for this (task, photo) so
			// "Re-run detection" cleanly replaces stale state.
			const persisted = (await saveDetectedElements({
				data: {
					taskId: props.taskId,
					photoId: props.photo.id,
					elements: detectedBoxes.map((box) => ({
						label: box.label,
						kind: box.kind,
						x: box.x,
						y: box.y,
						width: box.width,
						height: box.height,
						confidence: box.confidence ?? null,
					})),
				},
				headers,
			})) as ProtectedElementRow[];
			if (cancelledRef.current) return;

			const keyed = persisted.map(rowToKeyed);
			// Fallback path: if persistence returned nothing (e.g. an empty
			// detection set, or a test mock that returns []) but the provider
			// did return boxes, render them with client-side ids so the user
			// can still see and confirm.
			const finalElements: KeyedElement[] =
				keyed.length > 0
					? keyed
					: detectedBoxes.map((box) => ({
							id: randomId(),
							box,
							row: null,
						}));

			setElements(finalElements);
			setDebug(responseDebug ?? null);
			setSelected(new Set(finalElements.map((entry) => entry.id)));
		} catch (error) {
			if (cancelledRef.current) return;
			if (error instanceof Error && error.message === UNAUTHENTICATED_ERROR) {
				window.location.assign("/sign-in");
				return;
			}
			setDetectError(
				error instanceof Error ? error.message : "Detection failed"
			);
		} finally {
			if (!cancelledRef.current) setDetecting(false);
		}
	}

	async function toggleSelection(id: string) {
		const entry = elements?.find((item) => item.id === id);
		const wasSelected = selected.has(id);
		const nextSelected = !wasSelected;
		// Optimistic update.
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
		// Only persist toggles for rows that actually exist in the DB.
		if (!entry?.row) return;
		try {
			const headers = await getAuthHeaders();
			const updated = (await updateProtectedElementStatus({
				data: {
					elementId: entry.row.id,
					status: nextSelected ? "confirmed" : "rejected",
				},
				headers,
			})) as ProtectedElementRow;
			if (cancelledRef.current) return;
			// Re-sync the row so subsequent loads/toggles see the new status.
			setElements(
				(prev) =>
					prev?.map((item) =>
						item.id === id ? { ...item, row: updated } : item
					) ?? prev
			);
		} catch (error) {
			if (cancelledRef.current) return;
			// Revert.
			setSelected((prev) => {
				const next = new Set(prev);
				if (wasSelected) next.add(id);
				else next.delete(id);
				return next;
			});
			if (error instanceof Error && error.message === UNAUTHENTICATED_ERROR) {
				window.location.assign("/sign-in");
				return;
			}
			setDetectError(
				error instanceof Error ? error.message : "Failed to update selection"
			);
		}
	}

	function handleConfirm() {
		if (elements) {
			props.onConfirm(
				elements
					.filter((entry) => selected.has(entry.id))
					.map((entry) => entry.box)
			);
		} else {
			props.onConfirm(props.confirmedElements);
		}
	}

	// `visibleElements` normalises both data sources (live detection result
	// vs. previously-confirmed inbound props) into the same `KeyedElement`
	// shape so the JSX below renders identically without branching.
	const visibleElements: KeyedElement[] =
		elements ??
		props.confirmedElements.map((box, index) => ({
			id: `inbound-${index}`,
			box,
			row: null,
		}));

	return (
		<div
			aria-busy={detecting || loadingPersisted}
			className="grid gap-6 border border-border bg-surface p-10 max-md:p-6"
		>
			<header className="grid gap-2">
				<h2 className="m-0 font-display font-medium text-2xl text-foreground tracking-tight">
					2. Confirm protected elements
				</h2>
				<p className="m-0 max-w-[60ch] font-body text-[0.9375rem] text-ink-muted leading-relaxed">
					Detected elements will be preserved exactly in the generation prompt.
					Uncheck any that you want to allow to change.
				</p>
			</header>

			<div className="grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_360px]">
				<div className="relative min-h-[320px] border border-border bg-background">
					<PhotoTile
						alt={props.photo.original_name}
						className="min-h-[320px] w-full"
						fill={false}
						status={signedUrl ? "ready" : loadError ? "error" : "loading"}
						url={signedUrl}
					/>
					{visibleElements.map(({ id, box }) => {
						const isSelected = selected.has(id) || elements === null;
						return (
							<button
								aria-label={`Toggle ${box.label} protection`}
								aria-pressed={isSelected}
								className={cn(
									"absolute z-10 cursor-pointer border-2 bg-[rgba(200,38,48,0.08)] p-0",
									"hover:bg-[rgba(200,38,48,0.18)] focus-visible:outline-none",
									isSelected
										? "border-[rgb(200,38,48)]"
										: "border-[rgba(120,120,120,0.6)] border-dashed bg-[rgba(120,120,120,0.06)]"
								)}
								key={id}
								onClick={() => {
									void toggleSelection(id);
								}}
								style={{
									left: `${box.x * 100}%`,
									top: `${box.y * 100}%`,
									width: `${box.width * 100}%`,
									height: `${box.height * 100}%`,
								}}
								title={box.label}
								type="button"
							>
								<span
									className={cn(
										"pointer-events-none absolute bottom-full left-[-2px] inline-block max-w-[16rem] whitespace-nowrap px-1.5 py-1 font-semibold text-[0.7rem] text-white leading-tight tracking-[0.02em]",
										isSelected
											? "bg-[rgb(200,38,48)]"
											: "bg-[rgba(120,120,120,0.85)]"
									)}
								>
									{box.label}
								</span>
							</button>
						);
					})}
				</div>
				<aside className="grid content-start gap-4">
					<div className="flex flex-col items-stretch gap-2">
						<Button
							disabled={detecting || signedUrl === null}
							onClick={runDetection}
							type="button"
						>
							{detecting
								? "Detecting…"
								: elements
									? "Re-run detection"
									: "Detect protected elements"}
						</Button>
						<ModelPicker
							capability="detection"
							kind="text-vision"
							onChange={setModel}
						/>
					</div>
					{detectError ? (
						<p
							className="m-0 font-medium text-[0.9375rem] text-warning"
							role="alert"
						>
							{detectError}
						</p>
					) : null}
					{loadError ? (
						<p
							className="m-0 font-medium text-[0.9375rem] text-warning"
							role="alert"
						>
							{loadError}
						</p>
					) : null}
					{elements ? (
						<>
							<p className="m-0 text-[0.9375rem] text-ink-muted italic">
								Detected {elements.length} element
								{elements.length === 1 ? "" : "s"}. {selected.size} selected.
							</p>
							<Button onClick={handleConfirm} type="button">
								Confirm selection and continue
							</Button>
						</>
					) : (
						<p className="m-0 text-[0.9375rem] text-ink-muted italic">
							Run detection to see suggested bounding boxes.
						</p>
					)}
				</aside>
			</div>
			<DebugPanel debug={debug} label="Detection" />
		</div>
	);
}

/**
 * Resolve the bucket name for a photo row. Today every photo lives in
 * `source-photos` (enforced by the CHECK on the column), but reading the
 * column lets the storage helper survive any future bucket addition without
 * a code change here.
 */
function photoBucketFor(photo: PhotoRow): string {
	return photo.storage_bucket;
}
