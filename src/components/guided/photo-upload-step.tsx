import { useCallback, useEffect, useRef, useState } from "react";
import {
	getAuthHeaders,
	UNAUTHENTICATED_ERROR,
} from "../../lib/server-client/auth-headers";
import { supabaseBrowser } from "../../lib/supabase/browser";
import type { Tables } from "../../lib/types/database";
import { createPhotoRecord, listProjectPhotos } from "../../server/photos";

/**
 * Photo metadata row alias used internally — matches the Postgres `photos`
 * shape so we can pass full rows to the next step without re-querying.
 */
type PhotoRow = Tables<"photos">;

/** MIME types accepted by both the storage bucket and the `createPhotoSchema`. */
const ACCEPTED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
const BUCKET = "source-photos" as const;
/** Mirrors `file_size_limit` on the source-photos bucket (10 MiB). */
const MAX_BYTES = 10 * 1024 * 1024;
/**
 * Mirrors `createPhotoSchema.storagePath` — the second segment must match this
 * pattern. Centralised so the client sanitiser and the server validator can
 * never drift apart.
 */
const SAFE_FILENAME = /^[A-Za-z0-9._-]+$/;

/**
 * Convert an arbitrary filename into the `[A-Za-z0-9._-]+` shape required by
 * the storage path regex on the server. Falls back to `photo` so we never
 * produce an empty string — server validation would reject that anyway.
 */
function sanitizeFilename(name: string): string {
	const base = name.replace(/\s+/g, "-").replace(/[^A-Za-z0-9._-]/g, "");
	return base.length > 0 ? base : "photo";
}

/**
 * Step 1 of the guided flow: upload or pick a source photo.
 *
 * Uploads go directly from the browser to the `source-photos` Supabase
 * Storage bucket using the user's session JWT — bucket policies enforce that
 * the path's first segment equals `auth.uid()` so we keep authz on the
 * platform instead of trusting client code. After upload succeeds we persist
 * a `photos` row via the server fn so the rest of the app can join photos to
 * the project.
 *
 * Selecting an existing or newly-uploaded photo calls `onPhotoSelected` to
 * advance the parent guided flow. The component owns its own data lifecycle
 * (refresh after upload, cancellation on unmount) so the parent stays a thin
 * orchestrator.
 */
export function PhotoUploadStep(props: {
	projectId: string;
	selectedPhotoId: string | null;
	onPhotoSelected: (photo: PhotoRow) => void;
}) {
	const [photos, setPhotos] = useState<PhotoRow[] | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [uploadError, setUploadError] = useState<string | null>(null);
	const [uploading, setUploading] = useState(false);
	const [announcement, setAnnouncement] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const cancelledRef = useRef(false);

	const refresh = useCallback(async () => {
		if (cancelledRef.current) return;
		setLoadError(null);
		try {
			const headers = await getAuthHeaders();
			const rows: PhotoRow[] = await listProjectPhotos({
				data: { projectId: props.projectId },
				headers,
			});
			if (cancelledRef.current) return;
			setPhotos(rows);
		} catch (error) {
			if (cancelledRef.current) return;
			if (error instanceof Error && error.message === UNAUTHENTICATED_ERROR) {
				window.location.assign("/auth");
				return;
			}
			setLoadError(error instanceof Error ? error.message : "Failed to load");
			setPhotos([]);
		}
	}, [props.projectId]);

	useEffect(() => {
		cancelledRef.current = false;
		void refresh();
		return () => {
			cancelledRef.current = true;
		};
	}, [refresh]);

	useEffect(() => {
		if (!announcement) return;
		const timer = window.setTimeout(() => setAnnouncement(null), 3000);
		return () => window.clearTimeout(timer);
	}, [announcement]);

	async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		// Reset the input so picking the same file twice still re-fires `change`.
		event.target.value = "";
		if (!file) return;

		setUploadError(null);

		if (!ACCEPTED_MIME.has(file.type)) {
			setUploadError("Use a PNG, JPEG, or WEBP image.");
			return;
		}
		if (file.size > MAX_BYTES) {
			setUploadError("Image must be 10 MB or smaller.");
			return;
		}

		setUploading(true);
		try {
			// Resolve the signed-in user first so we can prefix the storage path
			// with `<uid>/`. Bucket policies require this so the user can only
			// write under their own folder; if there is no session we hand off
			// to the auth route before doing any network work.
			const { data: sessionResult } = await supabaseBrowser.auth.getSession();
			const userId = sessionResult.session?.user?.id;
			if (!userId) {
				window.location.assign("/auth");
				return;
			}

			const safeName = sanitizeFilename(file.name);
			// Ensure the sanitised name still passes the server-side regex —
			// the leading `<uid>/` segment is added inside this function.
			if (!SAFE_FILENAME.test(safeName)) {
				setUploadError("Filename has no usable characters.");
				return;
			}
			// `storagePath` matches the server-side regex `^[a-f0-9-]+\/[A-Za-z0-9._-]+$`
			// — first segment is the user's UUID (required by the storage
			// bucket policy `(storage.foldername(name))[1] = auth.uid()`),
			// second segment is the sanitised filename. The Date.now() prefix
			// keeps the path unique without collisions on repeated uploads.
			const objectName = `${Date.now()}-${safeName}`;
			const storagePath = `${userId}/${objectName}`;

			const upload = await supabaseBrowser.storage
				.from(BUCKET)
				.upload(storagePath, file, {
					cacheControl: "3600",
					contentType: file.type,
					upsert: false,
				});

			if (upload.error) {
				throw new Error(upload.error.message);
			}

			const headers = await getAuthHeaders();
			const row: PhotoRow = await createPhotoRecord({
				data: {
					projectId: props.projectId,
					storagePath,
					originalName: file.name.slice(0, 255),
					contentType: file.type as "image/png" | "image/jpeg" | "image/webp",
				},
				headers,
			});

			if (cancelledRef.current) return;
			setAnnouncement("Photo uploaded.");
			props.onPhotoSelected(row);
			await refresh();
		} catch (error) {
			if (cancelledRef.current) return;
			if (error instanceof Error && error.message === UNAUTHENTICATED_ERROR) {
				window.location.assign("/auth");
				return;
			}
			setUploadError(error instanceof Error ? error.message : "Upload failed");
		} finally {
			if (!cancelledRef.current) setUploading(false);
		}
	}

	function pickFile() {
		fileInputRef.current?.click();
	}

	return (
		<div className="guided-step" aria-busy={uploading}>
			<header className="guided-step-header">
				<h2>1. Upload a source photo</h2>
				<p>
					Pick a photo of the area you want to renovate. Allowed formats: PNG,
					JPEG, WEBP. Max 10 MB.
				</p>
			</header>

			<div className="guided-upload-controls">
				<button type="button" onClick={pickFile} disabled={uploading}>
					{uploading ? "Uploading…" : "Upload photo"}
				</button>
				<input
					ref={fileInputRef}
					type="file"
					accept="image/png,image/jpeg,image/webp"
					onChange={handleUpload}
					className="sr-only"
					aria-label="Choose a photo to upload"
				/>
				{uploadError ? <p role="alert">{uploadError}</p> : null}
			</div>

			{photos === null && loadError === null ? (
				<output className="workspace-status">Loading photos…</output>
			) : null}
			{loadError ? <p role="alert">{loadError}</p> : null}

			{photos && photos.length === 0 && !loadError ? (
				<p className="workspace-status">
					No photos yet. Upload one above to continue.
				</p>
			) : null}

			{photos && photos.length > 0 ? (
				<ul className="photo-grid" aria-label="Existing project photos">
					{photos.map((photo) => {
						const isSelected = photo.id === props.selectedPhotoId;
						return (
							<li key={photo.id}>
								<button
									type="button"
									className={`photo-tile${isSelected ? " selected" : ""}`}
									aria-pressed={isSelected}
									onClick={() => props.onPhotoSelected(photo)}
								>
									<span className="photo-tile-name">{photo.original_name}</span>
									<span className="photo-tile-meta">{photo.content_type}</span>
								</button>
							</li>
						);
					})}
				</ul>
			) : null}

			<output aria-live="polite" className="sr-only">
				{announcement ?? ""}
			</output>
		</div>
	);
}
