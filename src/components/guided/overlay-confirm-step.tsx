import { useCallback, useEffect, useRef, useState } from "react";
import type { BoundingBox } from "../../lib/ai/types";
import {
	getAuthHeaders,
	UNAUTHENTICATED_ERROR,
} from "../../lib/server-client/auth-headers";
import { supabaseBrowser } from "../../lib/supabase/browser";
import type { Tables } from "../../lib/types/database";
import { detectProtectedElements } from "../../server/generation";

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
 * the selected set is forwarded to the next step. We never persist the
 * detection result here — the parent guided flow keeps it in component state
 * so the user can step backwards without re-running the AI call.
 */
/**
 * Internal shape that pairs a bounding box with a stable client-side id so
 * React keys, the selection set, and confirmation handlers all reference the
 * same identity across re-renders.
 */
type KeyedElement = { id: string; box: BoundingBox };

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

export function OverlayConfirmStep(props: {
	photo: PhotoRow;
	taskTitle: string;
	confirmedElements: BoundingBox[];
	onConfirm: (elements: BoundingBox[]) => void;
}) {
	const [signedUrl, setSignedUrl] = useState<string | null>(null);
	const [detected, setDetected] = useState<KeyedElement[] | null>(null);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [loadError, setLoadError] = useState<string | null>(null);
	const [detectError, setDetectError] = useState<string | null>(null);
	const [detecting, setDetecting] = useState(false);
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

	useEffect(() => {
		cancelledRef.current = false;
		setSignedUrl(null);
		setDetected(null);
		setSelected(new Set());
		setDetectError(null);
		void mintUrl();
		return () => {
			cancelledRef.current = true;
		};
	}, [mintUrl]);

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
			const result: BoundingBox[] = await detectProtectedElements({
				data: {
					photoUrl: data.signedUrl,
					taskTitle: props.taskTitle,
				},
				headers,
			});
			if (cancelledRef.current) return;
			// Tag each box with a stable client id so React keys and selection
			// state both reference the same identity. `randomId()` falls back
			// to a Date.now()+Math.random() string on non-HTTPS origins where
			// `crypto.randomUUID` is undefined.
			const keyed: KeyedElement[] = result.map((box) => ({
				id: randomId(),
				box,
			}));
			setDetected(keyed);
			// Default: select every detected element. The user can deselect
			// individual boxes before confirming.
			setSelected(new Set(keyed.map((entry) => entry.id)));
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

	function toggleSelection(id: string) {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	}

	function handleConfirm() {
		if (detected) {
			props.onConfirm(
				detected
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
		detected ??
		props.confirmedElements.map((box, index) => ({
			id: `inbound-${index}`,
			box,
		}));

	return (
		<div className="guided-step" aria-busy={detecting}>
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
						const isSelected = selected.has(id) || detected === null;
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
								onClick={() => toggleSelection(id)}
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
							: detected
								? "Re-run detection"
								: "Detect protected elements"}
					</button>
					{detectError ? <p role="alert">{detectError}</p> : null}
					{loadError ? <p role="alert">{loadError}</p> : null}
					{detected ? (
						<>
							<p className="workspace-status">
								Detected {detected.length} element
								{detected.length === 1 ? "" : "s"}. {selected.size} selected.
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
