import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { clampAppearanceBox } from "@/lib/renovation/room-state";
import { UNAUTHENTICATED_ERROR } from "../../lib/server-client/auth-headers";
import { supabaseBrowser } from "../../lib/supabase/browser";

/** Mirrors the `furniture-references` bucket constraints. */
const ACCEPTED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
const BUCKET = "furniture-references" as const;
const MAX_BYTES = 10 * 1024 * 1024;

type CropBox = { x: number; y: number; width: number; height: number };

const DEFAULT_CROP: CropBox = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };

/** The uploaded photo's storage descriptor, handed to the host on confirm. */
export type UploadedFurniturePhoto = {
	storagePath: string;
	originalName: string;
	contentType: string;
	source: "product" | "photo";
};

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
 * The shared crop-and-upload flow for the Furniture Library: pick a product
 * image (used as-is) or a phone photo (a draggable crop box marks the piece),
 * upload the (optionally cropped) bytes straight to the furniture bucket, and
 * hand the storage descriptor to the host through `onConfirm`. The host owns
 * what happens next — creating an item (manual add) or appending a photo to an
 * existing one (edit dialog) — and any extra fields it needs via `extraFields`.
 */
export function FurniturePhotoPicker(props: {
	idleLabel: string;
	confirmLabel: string;
	confirmPendingLabel: string;
	disabled?: boolean;
	/** Extra host gating for the confirm button (e.g. a required label is empty). */
	confirmDisabled?: boolean;
	/** Rendered next to the idle add button while no file is chosen. */
	idleChildren?: ReactNode;
	/** Rendered inside the form above the confirm row (e.g. a label input). */
	extraFields?: ReactNode;
	onConfirm: (photo: UploadedFurniturePhoto) => void | Promise<void>;
	/** Lets the host clear its own extra-field state when the flow resets. */
	onCancel?: () => void;
}) {
	const [pendingFile, setPendingFile] = useState<File | null>(null);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);
	const [markPiece, setMarkPiece] = useState(false);
	const [crop, setCrop] = useState<CropBox>(DEFAULT_CROP);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
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

	useEffect(() => {
		cancelledRef.current = false;
		return () => {
			cancelledRef.current = true;
		};
	}, []);

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

	function reset() {
		setPendingFile(null);
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		setPreviewUrl(null);
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

	function cancel() {
		reset();
		props.onCancel?.();
	}

	async function confirm() {
		if (!pendingFile) return;
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

			await props.onConfirm({
				storagePath,
				originalName: sanitizeFilename(pendingFile.name),
				contentType,
				source: markPiece ? "photo" : "product",
			});
			if (cancelledRef.current) return;
			reset();
		} catch (caught) {
			if (cancelledRef.current) return;
			if (caught instanceof Error && caught.message === UNAUTHENTICATED_ERROR) {
				window.location.assign("/sign-in");
				return;
			}
			setError(
				caught instanceof Error ? caught.message : "Failed to upload photo"
			);
		} finally {
			if (!cancelledRef.current) setSaving(false);
		}
	}

	return (
		<div className="grid gap-3">
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
					{props.extraFields}
					<div className="flex flex-wrap items-center gap-3">
						<Button
							disabled={saving || props.confirmDisabled}
							onClick={() => void confirm()}
							type="button"
						>
							{saving ? props.confirmPendingLabel : props.confirmLabel}
						</Button>
						<Button
							disabled={saving}
							onClick={cancel}
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
						<span className="sr-only">{props.idleLabel}</span>
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
							{props.idleLabel}
						</Button>
					</label>
					{props.idleChildren}
				</div>
			)}

			{error ? (
				<p className="m-0 text-sm text-warning" role="alert">
					{error}
				</p>
			) : null}
		</div>
	);
}
