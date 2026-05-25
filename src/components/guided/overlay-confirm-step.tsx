import { useCallback, useEffect, useRef, useState } from "react";
import type { BoundingBox, ProviderDebug } from "../../lib/ai/types";
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
				error instanceof Error ? error.message : "Failed to load photo",
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
							.map(({ id }) => id),
					),
				);
			}
		} catch (error) {
			if (cancelledRef.current) return;
			if (error instanceof Error && error.message === UNAUTHENTICATED_ERROR) {
				window.location.assign("/auth");
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
			// Always mint a fresh URL right before the detection call. The URL
			// stored in component state may be older than the 10-minute TTL if
			// the user revisited this step, which would cause the provider to
			// fail to fetch the image. The on-screen `<img>` keeps using the
			// state URL — it loaded successfully when first minted.
			const { data, error: signError } = await supabaseBrowser.storage
				.from(photoBucketFor(props.photo))
				.createSignedUrl(props.photo.storage_path, SIGNED_URL_TTL_SECONDS);
			if (signError) throw signError;
			const headers = await getAuthHeaders();
			// Server fns now return `{ data, debug? }`. The legacy bare-array
			// shape is also accepted so older snapshots in tests still work
			// (and so a future plain endpoint can opt out of the wrapper).
			const response = (await detectProtectedElements({
				data: {
					photoUrl: data.signedUrl,
					taskTitle: props.taskTitle,
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
					projectId: props.projectId,
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
				window.location.assign("/auth");
				return;
			}
			setDetectError(
				error instanceof Error ? error.message : "Detection failed",
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
						item.id === id ? { ...item, row: updated } : item,
					) ?? prev,
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
				window.location.assign("/auth");
				return;
			}
			setDetectError(
				error instanceof Error ? error.message : "Failed to update selection",
			);
		}
	}

	function handleConfirm() {
		if (elements) {
			props.onConfirm(
				elements
					.filter((entry) => selected.has(entry.id))
					.map((entry) => entry.box),
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
		<div className="guided-step" aria-busy={detecting || loadingPersisted}>
			<header className="guided-step-header">
				<h2>2. Confirm protected elements</h2>
				<p>
					Detected elements will be preserved exactly in the generation prompt.
					Uncheck any that you want to allow to change.
				</p>
			</header>

			<div className="overlay-grid">
				<div className="photo-canvas">
					{signedUrl ? (
						<img
							src={signedUrl}
							alt={props.photo.original_name}
							className="photo-canvas-img"
						/>
					) : null}
					{visibleElements.map(({ id, box }) => {
						const isSelected = selected.has(id) || elements === null;
						return (
							<button
								key={id}
								type="button"
								className={`overlay-box${isSelected ? " selected" : ""}`}
								style={{
									left: `${box.x * 100}%`,
									top: `${box.y * 100}%`,
									width: `${box.width * 100}%`,
									height: `${box.height * 100}%`,
								}}
								aria-pressed={isSelected}
								aria-label={`Toggle ${box.label} protection`}
								onClick={() => {
									void toggleSelection(id);
								}}
							>
								{box.label}
							</button>
						);
					})}
				</div>
				<aside className="overlay-side">
					<button
						type="button"
						onClick={runDetection}
						disabled={detecting || signedUrl === null}
					>
						{detecting
							? "Detecting…"
							: elements
								? "Re-run detection"
								: "Detect protected elements"}
					</button>
					{detectError ? <p role="alert">{detectError}</p> : null}
					{loadError ? <p role="alert">{loadError}</p> : null}
					{elements ? (
						<>
							<p className="workspace-status">
								Detected {elements.length} element
								{elements.length === 1 ? "" : "s"}. {selected.size} selected.
							</p>
							<button type="button" onClick={handleConfirm}>
								Confirm selection and continue
							</button>
						</>
					) : (
						<p className="workspace-status">
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
