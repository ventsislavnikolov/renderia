import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { clampAppearanceBox } from "@/lib/renovation/room-state";
import {
	getAuthHeaders,
	UNAUTHENTICATED_ERROR,
} from "../../lib/server-client/auth-headers";
import { supabaseBrowser } from "../../lib/supabase/browser";
import {
	createFurnitureItem,
	deleteFurnitureItem,
	listFurnitureItems,
	setTaskFurniture,
} from "../../server/furniture";

/** Mirrors the `furniture-references` bucket constraints. */
const ACCEPTED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
const BUCKET = "furniture-references" as const;
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_SELECTED = 8;

type FurnitureItem = {
	id: string;
	label: string;
	source: "product" | "photo";
	originalName: string;
	signedUrl: string | null;
	selected: boolean;
	createdAt: string;
};

type CropBox = { x: number; y: number; width: number; height: number };

const DEFAULT_CROP: CropBox = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };

function sanitizeFilename(name: string): string {
	const base = name.replace(/\s+/g, "-").replace(/[^A-Za-z0-9._-]/g, "");
	return base.length > 0 ? base : "furniture";
}

/**
 * Crop the marked region out of the loaded image and return PNG bytes. The
 * box is normalized (0..1) relative to the rendered image, which maps 1:1
 * onto natural pixel space because the preview preserves aspect ratio.
 */
async function cropImageToBlob(image: HTMLImageElement, box: CropBox) {
	const sx = Math.round(box.x * image.naturalWidth);
	const sy = Math.round(box.y * image.naturalHeight);
	const sw = Math.max(1, Math.round(box.width * image.naturalWidth));
	const sh = Math.max(1, Math.round(box.height * image.naturalHeight));
	const canvas = document.createElement("canvas");
	canvas.width = sw;
	canvas.height = sh;
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Canvas unavailable");
	context.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
	return await new Promise<Blob>((resolve, reject) => {
		canvas.toBlob(
			(blob) =>
				blob ? resolve(blob) : reject(new Error("Failed to crop image")),
			"image/png"
		);
	});
}

/**
 * Per-project furniture reference library, rendered inside the generation
 * step. Users add furniture from product images (used as-is) or phone photos
 * (a draggable crop box marks which piece counts), then tick which items to
 * include — the selection persists per task and rides into generation as
 * extra reference images.
 */
export function FurniturePicker(props: {
	projectId: string;
	taskId: string;
	disabled?: boolean;
	onSelectionChange: (ids: string[]) => void;
}) {
	const [items, setItems] = useState<FurnitureItem[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [pendingFile, setPendingFile] = useState<File | null>(null);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);
	const [label, setLabel] = useState("");
	const [markPiece, setMarkPiece] = useState(false);
	const [crop, setCrop] = useState<CropBox>(DEFAULT_CROP);
	const [saving, setSaving] = useState(false);
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const previewImageRef = useRef<HTMLImageElement | null>(null);
	const previewFrameRef = useRef<HTMLDivElement | null>(null);
	const dragRef = useRef<{
		mode: "move" | "resize";
		startX: number;
		startY: number;
		origin: CropBox;
	} | null>(null);
	const cancelledRef = useRef(false);

	const handleAuthError = useCallback((caught: unknown) => {
		if (caught instanceof Error && caught.message === UNAUTHENTICATED_ERROR) {
			window.location.assign("/sign-in");
			return true;
		}
		return false;
	}, []);

	const refresh = useCallback(async () => {
		try {
			const headers = await getAuthHeaders();
			const result = await listFurnitureItems({
				data: { projectId: props.projectId, taskId: props.taskId },
				headers,
			});
			if (cancelledRef.current) return;
			setItems(result.items);
			props.onSelectionChange(
				result.items.filter((item) => item.selected).map((item) => item.id)
			);
		} catch (caught) {
			if (cancelledRef.current || handleAuthError(caught)) return;
			setError(
				caught instanceof Error ? caught.message : "Failed to load furniture"
			);
			setItems([]);
		}
	}, [props.projectId, props.taskId, props.onSelectionChange, handleAuthError]);

	useEffect(() => {
		cancelledRef.current = false;
		void refresh();
		return () => {
			cancelledRef.current = true;
		};
	}, [refresh]);

	useEffect(
		() => () => {
			if (previewUrl) URL.revokeObjectURL(previewUrl);
		},
		[previewUrl]
	);

	useEffect(() => {
		function handlePointerMove(event: PointerEvent) {
			if (!dragRef.current || !previewFrameRef.current) return;
			const rect = previewFrameRef.current.getBoundingClientRect();
			const deltaX = (event.clientX - dragRef.current.startX) / rect.width;
			const deltaY = (event.clientY - dragRef.current.startY) / rect.height;
			const origin = dragRef.current.origin;
			if (dragRef.current.mode === "move") {
				setCrop(
					clampAppearanceBox({
						...origin,
						x: origin.x + deltaX,
						y: origin.y + deltaY,
					})
				);
				return;
			}
			setCrop(
				clampAppearanceBox({
					...origin,
					width: origin.width + deltaX,
					height: origin.height + deltaY,
				})
			);
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
	}, []);

	function startDrag(
		event: React.PointerEvent<HTMLElement>,
		mode: "move" | "resize"
	) {
		event.preventDefault();
		event.stopPropagation();
		dragRef.current = {
			mode,
			startX: event.clientX,
			startY: event.clientY,
			origin: crop,
		};
	}

	function resetAddFlow() {
		setPendingFile(null);
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		setPreviewUrl(null);
		setLabel("");
		setMarkPiece(false);
		setCrop(DEFAULT_CROP);
		if (fileInputRef.current) fileInputRef.current.value = "";
	}

	function handleFileChosen(file: File | undefined) {
		setError(null);
		if (!file) return;
		if (!ACCEPTED_MIME.has(file.type)) {
			setError(
				"Unsupported image type. Use JPEG, PNG, or WebP (HEIC photos: pick from your phone's photo library and it converts automatically, or export as JPEG first)."
			);
			return;
		}
		if (file.size > MAX_BYTES) {
			setError("Image is larger than 10 MB.");
			return;
		}
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		setPendingFile(file);
		setPreviewUrl(URL.createObjectURL(file));
	}

	async function persistSelection(nextIds: string[]) {
		const headers = await getAuthHeaders();
		await setTaskFurniture({
			data: { taskId: props.taskId, furnitureItemIds: nextIds },
			headers,
		});
	}

	async function toggleSelected(item: FurnitureItem) {
		if (!items) return;
		const currentIds = items
			.filter((entry) => entry.selected)
			.map((entry) => entry.id);
		const nextIds = item.selected
			? currentIds.filter((id) => id !== item.id)
			: [...currentIds, item.id];
		if (nextIds.length > MAX_SELECTED) {
			setError(`At most ${MAX_SELECTED} furniture items per generation.`);
			return;
		}
		setError(null);
		const nextItems = items.map((entry) =>
			entry.id === item.id ? { ...entry, selected: !entry.selected } : entry
		);
		setItems(nextItems);
		props.onSelectionChange(nextIds);
		try {
			await persistSelection(nextIds);
		} catch (caught) {
			if (cancelledRef.current || handleAuthError(caught)) return;
			setItems(items);
			props.onSelectionChange(currentIds);
			setError(
				caught instanceof Error ? caught.message : "Failed to save selection"
			);
		}
	}

	async function removeItem(item: FurnitureItem) {
		if (!items) return;
		setError(null);
		try {
			const headers = await getAuthHeaders();
			await deleteFurnitureItem({
				data: { projectId: props.projectId, furnitureItemId: item.id },
				headers,
			});
			if (cancelledRef.current) return;
			const nextItems = items.filter((entry) => entry.id !== item.id);
			setItems(nextItems);
			props.onSelectionChange(
				nextItems.filter((entry) => entry.selected).map((entry) => entry.id)
			);
		} catch (caught) {
			if (cancelledRef.current || handleAuthError(caught)) return;
			setError(
				caught instanceof Error ? caught.message : "Failed to delete furniture"
			);
		}
	}

	async function saveFurniture() {
		if (!pendingFile || label.trim().length === 0) return;
		setSaving(true);
		setError(null);
		try {
			const { data: sessionResult } = await supabaseBrowser.auth.getSession();
			const userId = sessionResult.session?.user?.id;
			if (!userId) {
				window.location.assign("/sign-in");
				return;
			}

			let uploadBody: Blob = pendingFile;
			let contentType = pendingFile.type;
			let extension = sanitizeFilename(pendingFile.name).split(".").pop();
			if (markPiece) {
				const image = previewImageRef.current;
				if (!image?.complete) throw new Error("Image still loading");
				uploadBody = await cropImageToBlob(image, crop);
				contentType = "image/png";
				extension = "png";
			}
			const storagePath = `${userId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${extension ?? "png"}`;

			const upload = await supabaseBrowser.storage
				.from(BUCKET)
				.upload(storagePath, uploadBody, {
					cacheControl: "3600",
					contentType,
					upsert: false,
				});
			if (upload.error) throw new Error(upload.error.message);

			const headers = await getAuthHeaders();
			const created = await createFurnitureItem({
				data: {
					projectId: props.projectId,
					storagePath,
					originalName: sanitizeFilename(pendingFile.name),
					contentType,
					label: label.trim(),
					source: markPiece ? "photo" : "product",
				},
				headers,
			});

			// Auto-include the new piece — the user added it intending to use it.
			const currentIds = (items ?? [])
				.filter((entry) => entry.selected)
				.map((entry) => entry.id);
			if (currentIds.length < MAX_SELECTED) {
				await persistSelection([...currentIds, String(created.id)]);
			}
			if (cancelledRef.current) return;
			resetAddFlow();
			await refresh();
		} catch (caught) {
			if (cancelledRef.current || handleAuthError(caught)) return;
			setError(
				caught instanceof Error ? caught.message : "Failed to add furniture"
			);
		} finally {
			if (!cancelledRef.current) setSaving(false);
		}
	}

	const selectedCount = (items ?? []).filter((item) => item.selected).length;

	return (
		<section className="grid gap-4 rounded border border-border bg-popover p-5">
			<header className="grid gap-1">
				<h3 className="m-0 font-display font-medium text-foreground text-lg">
					Furniture to include
				</h3>
				<p className="m-0 max-w-[68ch] text-[0.875rem] text-ink-muted">
					Add furniture from product images or your own photos, then tick the
					pieces this room's variations must include. For a photo with several
					pieces, mark the one that counts.
				</p>
			</header>

			{items === null ? (
				<p className="m-0 text-ink-muted text-sm">Loading furniture…</p>
			) : null}

			{items && items.length > 0 ? (
				<ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2">
					{items.map((item) => (
						<li
							className="flex items-center gap-3 rounded border border-border p-3"
							key={item.id}
						>
							{item.signedUrl ? (
								<img
									alt={item.label}
									className="h-16 w-16 rounded bg-background object-cover"
									src={item.signedUrl}
								/>
							) : (
								<div className="h-16 w-16 rounded bg-muted" />
							)}
							<div className="min-w-0 flex-1">
								<div className="truncate font-medium text-foreground text-sm">
									{item.label}
								</div>
								<div className="text-ink-muted text-xs">
									{item.source === "product" ? "Product image" : "From photo"}
								</div>
							</div>
							<label className="flex items-center gap-2 text-sm">
								<input
									checked={item.selected}
									disabled={props.disabled}
									onChange={() => void toggleSelected(item)}
									type="checkbox"
								/>
								Include
							</label>
							<Button
								disabled={props.disabled}
								onClick={() => void removeItem(item)}
								size="sm"
								type="button"
								variant="outline"
							>
								Delete
							</Button>
						</li>
					))}
				</ul>
			) : null}

			{items && items.length === 0 ? (
				<p className="m-0 text-ink-muted text-sm">
					No furniture saved for this project yet.
				</p>
			) : null}

			{pendingFile && previewUrl ? (
				<div className="grid gap-3 rounded border border-border p-4">
					<div
						className="relative w-fit max-w-full overflow-hidden rounded border border-border bg-background"
						ref={previewFrameRef}
					>
						<img
							alt="Furniture preview"
							className="block max-h-[420px] w-auto max-w-full"
							ref={previewImageRef}
							src={previewUrl}
						/>
						{markPiece ? (
							<button
								aria-label="Marked furniture region"
								className="absolute cursor-move border-2 border-red-500 bg-red-500/10"
								onPointerDown={(event) => startDrag(event, "move")}
								style={{
									left: `${crop.x * 100}%`,
									top: `${crop.y * 100}%`,
									width: `${crop.width * 100}%`,
									height: `${crop.height * 100}%`,
								}}
								type="button"
							>
								<span
									className="absolute right-0 bottom-0 h-3 w-3 cursor-se-resize rounded-tl bg-background/85"
									onPointerDown={(event) => startDrag(event, "resize")}
								/>
							</button>
						) : null}
					</div>
					<label className="flex items-center gap-2 text-sm">
						<input
							checked={markPiece}
							onChange={(event) => setMarkPiece(event.target.checked)}
							type="checkbox"
						/>
						Photo shows multiple pieces — mark the one to include
					</label>
					{markPiece ? (
						<p className="m-0 text-ink-muted text-sm">
							Drag the box over the furniture piece. Drag the bottom-right
							corner to resize. Only the marked region is saved.
						</p>
					) : null}
					<label className="grid max-w-md gap-1 text-sm">
						<span>What is this piece?</span>
						<input
							className="rounded border border-border bg-background px-3 py-2"
							onChange={(event) => setLabel(event.target.value)}
							placeholder="e.g. white 4-drawer dresser"
							value={label}
						/>
					</label>
					<div className="flex flex-wrap items-center gap-3">
						<Button
							disabled={saving || label.trim().length === 0}
							onClick={() => void saveFurniture()}
							type="button"
						>
							{saving ? "Saving…" : "Save furniture"}
						</Button>
						<Button
							disabled={saving}
							onClick={resetAddFlow}
							type="button"
							variant="outline"
						>
							Cancel
						</Button>
					</div>
				</div>
			) : (
				<div className="flex flex-wrap items-center gap-3">
					<label className="inline-flex">
						<span className="sr-only">Add furniture image</span>
						<input
							accept="image/png,image/jpeg,image/webp"
							className="hidden"
							onChange={(event) => handleFileChosen(event.target.files?.[0])}
							ref={fileInputRef}
							type="file"
						/>
						<Button
							disabled={props.disabled}
							onClick={() => fileInputRef.current?.click()}
							type="button"
							variant="outline"
						>
							Add furniture image
						</Button>
					</label>
					{selectedCount > 0 ? (
						<span className="text-ink-muted text-sm">
							{selectedCount} piece{selectedCount === 1 ? "" : "s"} will be
							included in the next generation.
						</span>
					) : null}
				</div>
			)}

			{error ? (
				<p className="m-0 text-sm text-warning" role="alert">
					{error}
				</p>
			) : null}
		</section>
	);
}
