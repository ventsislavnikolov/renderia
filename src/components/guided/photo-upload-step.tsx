import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { track } from "../../lib/analytics/track";
import { formatRelativeTime } from "../../lib/format";
import {
	getAuthHeaders,
	UNAUTHENTICATED_ERROR,
} from "../../lib/server-client/auth-headers";
import { supabaseBrowser } from "../../lib/supabase/browser";
import type { Tables } from "../../lib/types/database";
import {
	createPhotoRecord,
	deletePhoto,
	listProjectPhotos,
} from "../../server/photos";

/**
 * Photo metadata row alias used internally — matches the Postgres `photos`
 * shape so we can pass full rows to the next step without re-querying.
 */
type PhotoRow = Tables<"photos">;

/**
 * One file in an in-flight batch upload. Successful items are removed once their
 * `photos` row lands in the grid; failed items linger as a tile with an inline
 * Retry so a partial-batch failure never loses the user's other uploads.
 */
type UploadItem = {
	tempId: string;
	file: File;
	name: string;
	status: "uploading" | "error";
	error?: string;
};

/** Hard cap on photos per Room Set (task) — mirrors `taskRoomStateSchema`. */
const ROOM_SET_MAX = 4;

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
 * the current task.
 *
 * Selecting an existing or newly-uploaded photo calls `onPhotoSelected` to
 * advance the parent guided flow. The component owns its own data lifecycle
 * (refresh after upload, cancellation on unmount) so the parent stays a thin
 * orchestrator.
 */
/** TTL for tile-preview signed URLs. 10 minutes covers a normal review pass. */
const TILE_URL_TTL_SECONDS = 600;

export function PhotoUploadStep(props: {
	projectId: string;
	taskId: string;
	selectedPhotoId?: string | null;
	selectedPhotoIds?: string[];
	onPhotoSelected?: (photo: PhotoRow) => void;
	onPhotosConfirmed?: (photos: PhotoRow[]) => void;
	onPhotoDeleted?: (photoId: string) => void;
}) {
	const [photos, setPhotos] = useState<PhotoRow[] | null>(null);
	const [photoPendingDelete, setPhotoPendingDelete] = useState<PhotoRow | null>(
		null
	);
	const [deleting, setDeleting] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const [signedUrls, setSignedUrls] = useState<Map<string, string>>(
		() => new Map()
	);
	const [loadError, setLoadError] = useState<string | null>(null);
	// Batch-level message: skipped invalid files, or an over-cap rejection.
	const [uploadError, setUploadError] = useState<string | null>(null);
	// In-flight and failed files in the current batch (successes drop out).
	const [uploads, setUploads] = useState<UploadItem[]>([]);
	const [dragActive, setDragActive] = useState(false);
	const [announcement, setAnnouncement] = useState<string | null>(null);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(
		() => new Set(props.selectedPhotoIds ?? [])
	);
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const cancelledRef = useRef(false);

	const refresh = useCallback(async () => {
		if (cancelledRef.current) return;
		setLoadError(null);
		try {
			const headers = await getAuthHeaders();
			const rows: PhotoRow[] = await listProjectPhotos({
				data: { projectId: props.projectId, taskId: props.taskId },
				headers,
			});
			if (cancelledRef.current) return;
			setPhotos(rows);
		} catch (error) {
			if (cancelledRef.current) return;
			if (error instanceof Error && error.message === UNAUTHENTICATED_ERROR) {
				window.location.assign("/sign-in");
				return;
			}
			setLoadError(error instanceof Error ? error.message : "Failed to load");
			setPhotos([]);
		}
	}, [props.projectId, props.taskId]);

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

	useEffect(() => {
		if (props.selectedPhotoIds) {
			setSelectedIds(new Set(props.selectedPhotoIds));
		}
	}, [props.selectedPhotoIds]);

	// Mint short-lived signed URLs for each photo in parallel so tiles can show
	// the actual image. We avoid re-minting URLs we already have — `photos`
	// usually grows by one row at a time (after upload) so the existing entries
	// are reused.
	useEffect(() => {
		if (!photos || photos.length === 0) return;
		const cancelled = { current: false };
		const toFetch = photos.filter((photo) => !signedUrls.has(photo.id));
		if (toFetch.length === 0) return;
		void (async () => {
			const results = await Promise.all(
				toFetch.map(async (photo) => {
					const { data, error } = await supabaseBrowser.storage
						.from(photo.storage_bucket)
						.createSignedUrl(photo.storage_path, TILE_URL_TTL_SECONDS);
					if (error || !data) return null;
					return [photo.id, data.signedUrl] as const;
				})
			);
			if (cancelled.current || cancelledRef.current) return;
			setSignedUrls((prev) => {
				const next = new Map(prev);
				for (const entry of results) {
					if (entry) next.set(entry[0], entry[1]);
				}
				return next;
			});
		})();
		return () => {
			cancelled.current = true;
		};
	}, [photos, signedUrls]);

	const isUploading = uploads.some((item) => item.status === "uploading");

	/** Split a batch into uploadable files and skipped ones (with a reason). */
	function classifyFiles(files: File[]): { valid: File[]; skipped: string[] } {
		const valid: File[] = [];
		const skipped: string[] = [];
		for (const file of files) {
			if (!ACCEPTED_MIME.has(file.type)) {
				skipped.push(`${file.name} (use PNG/JPEG/WEBP)`);
			} else if (file.size > MAX_BYTES) {
				skipped.push(`${file.name} (over 10 MB)`);
			} else {
				valid.push(file);
			}
		}
		return { valid, skipped };
	}

	/**
	 * Entry point for both the file picker and the drop zone. Validates per
	 * file, enforces the Room Set cap on the whole batch, then uploads the valid
	 * files in parallel.
	 */
	function handleFiles(fileList: FileList | null) {
		const files = fileList ? Array.from(fileList) : [];
		if (files.length === 0) return;
		setUploadError(null);

		const { valid, skipped } = classifyFiles(files);

		// The cap is the whole Room Set: existing task photos + this batch <= 4.
		// Reject the batch as a unit so we never partially fill past the limit.
		const existing = photos?.length ?? 0;
		if (valid.length > 0 && existing + valid.length > ROOM_SET_MAX) {
			const remaining = Math.max(0, ROOM_SET_MAX - existing);
			setUploadError(
				remaining === 0
					? "This room already has 4 photos (the max). Delete one to add more."
					: `You can add ${remaining} more photo${
							remaining === 1 ? "" : "s"
						} (4 max per room). Nothing was uploaded — choose fewer files.`
			);
			return;
		}

		if (skipped.length > 0) {
			setUploadError(
				`${skipped.length} file${
					skipped.length === 1 ? "" : "s"
				} skipped: ${skipped.join(", ")}.`
			);
		}
		if (valid.length === 0) return;
		void uploadBatch(valid);
	}

	async function uploadBatch(files: File[]) {
		// Resolve the signed-in user once so each upload can prefix its path with
		// `<uid>/` (required by the bucket policy); bail to auth if there's none.
		const { data: sessionResult } = await supabaseBrowser.auth.getSession();
		const userId = sessionResult.session?.user?.id;
		if (!userId) {
			window.location.assign("/sign-in");
			return;
		}
		const items: UploadItem[] = files.map((file) => ({
			tempId: crypto.randomUUID(),
			file,
			name: file.name,
			status: "uploading",
		}));
		setUploads((prev) => [...prev, ...items]);
		// Parallel, independent: one file's failure never blocks the others.
		await Promise.allSettled(items.map((item) => uploadOne(item, userId)));
	}

	async function uploadOne(item: UploadItem, userId: string) {
		try {
			const safeName = sanitizeFilename(item.file.name);
			if (!SAFE_FILENAME.test(safeName)) {
				throw new Error("Filename has no usable characters.");
			}
			// A UUID segment keeps parallel uploads collision-free (Date.now()
			// alone can repeat within a batch) and still satisfies the server
			// path regex `^[a-f0-9-]+\/[A-Za-z0-9._-]+$`.
			const storagePath = `${userId}/${crypto.randomUUID()}-${safeName}`;

			const upload = await supabaseBrowser.storage
				.from(BUCKET)
				.upload(storagePath, item.file, {
					cacheControl: "3600",
					contentType: item.file.type,
					upsert: false,
				});
			if (upload.error) throw new Error(upload.error.message);

			// If the metadata insert fails after a successful upload, remove the
			// orphaned object before surfacing the error.
			let row: PhotoRow;
			try {
				const headers = await getAuthHeaders();
				row = await createPhotoRecord({
					data: {
						projectId: props.projectId,
						taskId: props.taskId,
						storagePath,
						originalName: item.file.name.slice(0, 255),
						contentType: item.file.type as
							| "image/png"
							| "image/jpeg"
							| "image/webp",
					},
					headers,
				});
			} catch (createError) {
				try {
					await supabaseBrowser.storage.from(BUCKET).remove([storagePath]);
				} catch (cleanupError) {
					console.error(
						"Failed to remove orphaned storage object",
						cleanupError
					);
				}
				throw createError;
			}

			if (cancelledRef.current) return;
			track("photo_uploaded");
			// Drop the in-flight tile and surface the real photo immediately.
			setUploads((prev) =>
				prev.filter((entry) => entry.tempId !== item.tempId)
			);
			setPhotos((prev) => (prev ? [...prev, row] : [row]));
			if (isMultiSelectMode()) {
				setSelectedIds((prev) => {
					if (prev.has(row.id) || prev.size >= ROOM_SET_MAX) return prev;
					const next = new Set(prev);
					next.add(row.id);
					return next;
				});
			} else {
				props.onPhotoSelected?.(row);
			}
			setAnnouncement(`${item.name} uploaded.`);
		} catch (error) {
			if (cancelledRef.current) return;
			if (error instanceof Error && error.message === UNAUTHENTICATED_ERROR) {
				window.location.assign("/sign-in");
				return;
			}
			const message = error instanceof Error ? error.message : "Upload failed";
			setUploads((prev) =>
				prev.map((entry) =>
					entry.tempId === item.tempId
						? { ...entry, status: "error", error: message }
						: entry
				)
			);
		}
	}

	async function retryUpload(item: UploadItem) {
		const { data: sessionResult } = await supabaseBrowser.auth.getSession();
		const userId = sessionResult.session?.user?.id;
		if (!userId) {
			window.location.assign("/sign-in");
			return;
		}
		setUploads((prev) =>
			prev.map((entry) =>
				entry.tempId === item.tempId
					? { ...entry, status: "uploading", error: undefined }
					: entry
			)
		);
		await uploadOne(item, userId);
	}

	function handleDrop(event: React.DragEvent<HTMLDivElement>) {
		event.preventDefault();
		setDragActive(false);
		handleFiles(event.dataTransfer.files);
	}

	async function confirmDeletePhoto() {
		if (!photoPendingDelete) return;
		const target = photoPendingDelete;
		setDeleting(true);
		setDeleteError(null);
		try {
			const headers = await getAuthHeaders();
			await deletePhoto({
				data: {
					projectId: props.projectId,
					taskId: props.taskId,
					photoId: target.id,
				},
				headers,
			});
			if (cancelledRef.current) return;
			setSelectedIds((prev) => {
				const next = new Set(prev);
				next.delete(target.id);
				return next;
			});
			setAnnouncement("Photo deleted.");
			setPhotoPendingDelete(null);
			props.onPhotoDeleted?.(target.id);
			await refresh();
		} catch (error) {
			if (cancelledRef.current) return;
			if (error instanceof Error && error.message === UNAUTHENTICATED_ERROR) {
				window.location.assign("/sign-in");
				return;
			}
			setDeleteError(
				error instanceof Error ? error.message : "Failed to delete"
			);
		} finally {
			if (!cancelledRef.current) setDeleting(false);
		}
	}

	function isMultiSelectMode() {
		return typeof props.onPhotosConfirmed === "function";
	}

	function togglePhoto(photo: PhotoRow) {
		if (!isMultiSelectMode()) {
			props.onPhotoSelected?.(photo);
			return;
		}
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(photo.id)) {
				next.delete(photo.id);
			} else if (next.size < 4) {
				next.add(photo.id);
			}
			return next;
		});
	}

	function confirmSelectedPhotos() {
		if (!photos || !props.onPhotosConfirmed) return;
		const selected = photos.filter((photo) => selectedIds.has(photo.id));
		if (selected.length === 0) return;
		props.onPhotosConfirmed(selected);
	}

	function pickFile() {
		fileInputRef.current?.click();
	}

	return (
		<div
			aria-busy={isUploading}
			className="grid gap-6 border border-border bg-surface p-10 max-md:p-6"
		>
			<header className="grid gap-2">
				<h2 className="m-0 font-display font-medium text-2xl text-foreground tracking-tight">
					1. Upload source photos
				</h2>
				<p className="m-0 max-w-[60ch] font-body text-[0.9375rem] text-ink-muted leading-relaxed">
					Add 1 to 4 photos of the same room — choose several files at once or
					drag and drop. Allowed formats: PNG, JPEG, WEBP. Max 10 MB each.
				</p>
			</header>

			<div className="grid gap-4">
				{/** biome-ignore lint/a11y/noStaticElementInteractions: drop zone is a mouse enhancement; the button is the keyboard/AT path. */}
				<div
					className={cn(
						"flex flex-wrap items-center gap-4 rounded-lg border border-dashed px-5 py-5 transition-colors",
						dragActive ? "border-foreground bg-background" : "border-border"
					)}
					onDragLeave={(event) => {
						event.preventDefault();
						setDragActive(false);
					}}
					onDragOver={(event) => {
						event.preventDefault();
						setDragActive(true);
					}}
					onDrop={handleDrop}
				>
					<Button disabled={isUploading} onClick={pickFile} type="button">
						{isUploading ? "Uploading…" : "Upload photos"}
					</Button>
					<span className="font-body text-[0.875rem] text-ink-muted">
						or drag and drop here
					</span>
					<input
						accept="image/png,image/jpeg,image/webp"
						aria-label="Choose photos to upload"
						className="sr-only"
						multiple
						onChange={(event) => {
							handleFiles(event.target.files);
							// Reset so re-picking the same files still fires `change`.
							event.target.value = "";
						}}
						ref={fileInputRef}
						type="file"
					/>
				</div>

				<div className="flex flex-wrap items-center gap-4">
					{isMultiSelectMode() ? (
						<Button
							disabled={selectedIds.size === 0}
							onClick={confirmSelectedPhotos}
							type="button"
							variant="outline"
						>
							Continue with {selectedIds.size} photo
							{selectedIds.size === 1 ? "" : "s"}
						</Button>
					) : null}
					{uploadError ? (
						<p
							className="m-0 font-medium text-[0.9375rem] text-warning"
							role="alert"
						>
							{uploadError}
						</p>
					) : null}
				</div>
			</div>

			{photos === null && loadError === null ? (
				<ul
					aria-label="Existing project photos"
					className="m-0 grid list-none gap-6 p-0 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]"
				>
					{[0, 1, 2].map((i) => (
						<li key={i}>
							<Skeleton className="aspect-[4/3] w-full rounded-md" />
						</li>
					))}
				</ul>
			) : null}
			{loadError ? (
				<p
					className="m-0 font-medium text-[0.9375rem] text-warning"
					role="alert"
				>
					{loadError}
				</p>
			) : null}

			{photos && photos.length === 0 && !loadError && uploads.length === 0 ? (
				<p className="m-0 text-[0.9375rem] text-ink-muted italic">
					No photos yet. Upload one above to continue.
				</p>
			) : null}

			{(photos && photos.length > 0) || uploads.length > 0 ? (
				<ul
					aria-label="Existing project photos"
					className="m-0 grid list-none gap-6 p-0 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]"
				>
					{uploads.map((item) => (
						<li key={item.tempId}>
							<div className="grid grid-rows-[1fr_auto] overflow-hidden border border-border bg-popover">
								{item.status === "uploading" ? (
									<Skeleton className="aspect-[4/3] w-full rounded-none" />
								) : (
									<div className="flex aspect-[4/3] w-full items-center justify-center bg-background px-4 text-center">
										<span className="font-body text-[0.8125rem] text-destructive">
											{item.error ?? "Upload failed"}
										</span>
									</div>
								)}
								<span className="grid gap-1 px-4 py-3">
									<span className="break-words font-body font-medium text-[0.8125rem] text-foreground">
										{item.name}
									</span>
									{item.status === "uploading" ? (
										<span className="font-body font-semibold text-[0.6875rem] text-ink-subtle uppercase tracking-[0.06em]">
											Uploading…
										</span>
									) : (
										<Button
											className="justify-self-start"
											onClick={() => void retryUpload(item)}
											size="sm"
											type="button"
											variant="outline"
										>
											Retry
										</Button>
									)}
								</span>
							</div>
						</li>
					))}
					{(photos ?? []).map((photo) => {
						const isSelected = isMultiSelectMode()
							? selectedIds.has(photo.id)
							: photo.id === props.selectedPhotoId;
						const url = signedUrls.get(photo.id);
						return (
							<li className="relative" key={photo.id}>
								<button
									aria-pressed={isSelected}
									className={cn(
										"grid w-full cursor-pointer grid-rows-[1fr_auto] overflow-hidden border border-border bg-popover p-0 text-left transition-[border-color,box-shadow]",
										"hover:border-foreground",
										isSelected &&
											"border-primary shadow-[inset_0_0_0_1px_var(--primary)]"
									)}
									onClick={() => togglePhoto(photo)}
									type="button"
								>
									{url ? (
										<img
											alt={photo.original_name}
											className="block aspect-[4/3] w-full bg-background object-cover"
											src={url}
										/>
									) : (
										<div
											aria-hidden="true"
											className="block aspect-[4/3] w-full bg-background"
										/>
									)}
									<span className="grid gap-0.5 px-4 py-3">
										<span className="break-words font-body font-medium text-[0.8125rem] text-foreground">
											{photo.original_name}
										</span>
										<span className="flex items-center gap-1.5 font-body font-semibold text-[0.6875rem] text-ink-subtle uppercase tracking-[0.06em]">
											{photo.content_type}
											<span aria-hidden="true">·</span>
											<span className="normal-case tracking-normal">
												{formatRelativeTime(photo.created_at)}
											</span>
										</span>
									</span>
								</button>
								<button
									aria-label={`Delete ${photo.original_name}`}
									className={cn(
										"absolute top-2 right-2 inline-flex size-8 items-center justify-center rounded-md",
										"border border-border bg-background/90 text-ink-muted backdrop-blur",
										"transition-colors hover:border-destructive hover:text-destructive",
										"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
									)}
									onClick={() => {
										setDeleteError(null);
										setPhotoPendingDelete(photo);
									}}
									type="button"
								>
									<Trash2 aria-hidden="true" className="size-4" />
								</button>
							</li>
						);
					})}
				</ul>
			) : null}

			<output aria-live="polite" className="sr-only">
				{announcement ?? ""}
			</output>

			<Dialog
				onOpenChange={(open) => {
					if (!open) {
						setPhotoPendingDelete(null);
						setDeleteError(null);
					}
				}}
				open={photoPendingDelete !== null}
			>
				<DialogContent className="gap-0 overflow-hidden border-border bg-background p-0 shadow-2xl sm:max-w-[460px]">
					<div className="grid gap-5 p-6">
						<DialogHeader className="gap-1.5 pr-8">
							<DialogTitle className="font-body font-semibold text-[1.125rem] tracking-tight">
								Delete photo?
							</DialogTitle>
							<DialogDescription className="text-[0.875rem] leading-5">
								This permanently removes
								{photoPendingDelete
									? ` “${photoPendingDelete.original_name}”`
									: " this photo"}{" "}
								from the room, along with any detected elements and previews
								based on it. This can&apos;t be undone.
							</DialogDescription>
						</DialogHeader>
						{deleteError ? (
							<p
								className="m-0 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 font-medium text-[0.875rem] text-destructive"
								role="alert"
							>
								{deleteError}
							</p>
						) : null}
						<DialogFooter>
							<DialogClose asChild>
								<Button disabled={deleting} type="button" variant="outline">
									Cancel
								</Button>
							</DialogClose>
							<Button
								disabled={deleting}
								onClick={confirmDeletePhoto}
								type="button"
								variant="destructive"
							>
								{deleting ? "Deleting…" : "Delete photo"}
							</Button>
						</DialogFooter>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
