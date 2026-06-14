import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
	FurniturePhotoPicker,
	type UploadedFurniturePhoto,
} from "@/components/furniture/furniture-photo-picker";
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
import { cn } from "@/lib/utils";
import { MAX_FURNITURE_PHOTOS } from "../../lib/renovation/schema";
import {
	getAuthHeaders,
	UNAUTHENTICATED_ERROR,
} from "../../lib/server-client/auth-headers";
import {
	addFurniturePhoto,
	deleteFurniturePhoto,
	type FurniturePhotoPayload,
	listFurnitureItems,
	setActiveFurniturePhoto,
	updateFurnitureItem,
} from "../../server/furniture";

export type EditableFurnitureItem = {
	id: string;
	label: string;
	widthCm: number | null;
	heightCm: number | null;
	depthCm: number | null;
	photos: FurniturePhotoPayload[];
};

function toInputValue(value: number | null): string {
	return value === null ? "" : String(value);
}

/** Blank → null (cleared); a positive number → that number; anything else → invalid. */
function parseDimension(raw: string): number | null | undefined {
	const trimmed = raw.trim();
	if (trimmed === "") return null;
	const parsed = Number(trimmed);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/** Active photo first; the rest stay in their (created_at-ascending) order. */
function activeFirst(
	a: FurniturePhotoPayload,
	b: FurniturePhotoPayload
): number {
	if (a.isActive === b.isActive) return 0;
	return a.isActive ? -1 : 1;
}

/**
 * Edit an item's user-correctable fields — its label and the three dimensions
 * — and manage its Furniture Photos: a thumbnail gallery with the Reference
 * Image badge on the active one, click-to-set-active, delete-per-photo (blocked
 * on the last one), and an "Add photo" control reusing the crop flow (capped at
 * {@link MAX_FURNITURE_PHOTOS}). Rendered as a controlled dialog: a non-null
 * `item` opens it pre-filled; field edits flow back through `onSaved`, and photo
 * changes through `onPhotosChanged` so the host can refresh its card.
 */
export function EditFurniture(props: {
	item: EditableFurnitureItem | null;
	onClose: () => void;
	onSaved: (updated: EditableFurnitureItem) => void;
	onPhotosChanged?: () => void | Promise<void>;
}) {
	const [label, setLabel] = useState("");
	const [width, setWidth] = useState("");
	const [height, setHeight] = useState("");
	const [depth, setDepth] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [photos, setPhotos] = useState<FurniturePhotoPayload[]>([]);
	const [photoBusy, setPhotoBusy] = useState(false);
	const [photoError, setPhotoError] = useState<string | null>(null);

	const item = props.item;

	useEffect(() => {
		if (!item) return;
		setLabel(item.label);
		setWidth(toInputValue(item.widthCm));
		setHeight(toInputValue(item.heightCm));
		setDepth(toInputValue(item.depthCm));
		setPhotos((item.photos ?? []).slice().sort(activeFirst));
		setError(null);
		setPhotoError(null);
	}, [item]);

	function handleAuthError(caught: unknown): boolean {
		if (caught instanceof Error && caught.message === UNAUTHENTICATED_ERROR) {
			window.location.assign("/sign-in");
			return true;
		}
		return false;
	}

	async function save() {
		if (!item) return;
		const trimmedLabel = label.trim();
		if (trimmedLabel.length === 0) {
			setError("Give the piece a name.");
			return;
		}
		const widthCm = parseDimension(width);
		const heightCm = parseDimension(height);
		const depthCm = parseDimension(depth);
		if (
			widthCm === undefined ||
			heightCm === undefined ||
			depthCm === undefined
		) {
			setError("Dimensions must be positive numbers in cm, or left blank.");
			return;
		}
		setSaving(true);
		setError(null);
		try {
			const headers = await getAuthHeaders();
			await updateFurnitureItem({
				data: {
					furnitureItemId: item.id,
					label: trimmedLabel,
					widthCm,
					heightCm,
					depthCm,
				},
				headers,
			});
			props.onSaved({
				id: item.id,
				label: trimmedLabel,
				widthCm,
				heightCm,
				depthCm,
				photos,
			});
		} catch (caught) {
			if (handleAuthError(caught)) return;
			setError(
				caught instanceof Error ? caught.message : "Failed to update furniture"
			);
		} finally {
			setSaving(false);
		}
	}

	async function setActive(photoId: string) {
		if (!item || photoBusy) return;
		const target = photos.find((photo) => photo.id === photoId);
		if (!target || target.isActive) return;
		const previous = photos;
		setPhotos(
			photos
				.map((photo) => ({ ...photo, isActive: photo.id === photoId }))
				.slice()
				.sort(activeFirst)
		);
		setPhotoBusy(true);
		setPhotoError(null);
		try {
			const headers = await getAuthHeaders();
			await setActiveFurniturePhoto({
				data: { furnitureItemId: item.id, photoId },
				headers,
			});
			await props.onPhotosChanged?.();
		} catch (caught) {
			if (handleAuthError(caught)) return;
			setPhotos(previous);
			setPhotoError(
				caught instanceof Error
					? caught.message
					: "Failed to set the Reference Image"
			);
		} finally {
			setPhotoBusy(false);
		}
	}

	async function removePhoto(photoId: string) {
		if (!item || photoBusy || photos.length <= 1) return;
		const target = photos.find((photo) => photo.id === photoId);
		if (!target) return;
		const previous = photos;
		let next = photos.filter((photo) => photo.id !== photoId);
		// Deleting the active photo promotes the oldest survivor — mirrors the
		// server's auto-promote so the gallery never shows zero active photos.
		if (target.isActive && next.length > 0) {
			const oldest = next.reduce((a, b) =>
				a.createdAt <= b.createdAt ? a : b
			);
			next = next
				.map((photo) => ({ ...photo, isActive: photo.id === oldest.id }))
				.slice()
				.sort(activeFirst);
		}
		setPhotos(next);
		setPhotoBusy(true);
		setPhotoError(null);
		try {
			const headers = await getAuthHeaders();
			await deleteFurniturePhoto({
				data: { furnitureItemId: item.id, photoId },
				headers,
			});
			await props.onPhotosChanged?.();
		} catch (caught) {
			if (handleAuthError(caught)) return;
			setPhotos(previous);
			setPhotoError(
				caught instanceof Error ? caught.message : "Failed to delete the photo"
			);
		} finally {
			setPhotoBusy(false);
		}
	}

	async function addPhoto(photo: UploadedFurniturePhoto) {
		if (!item) return;
		const headers = await getAuthHeaders();
		await addFurniturePhoto({
			data: {
				furnitureItemId: item.id,
				storagePath: photo.storagePath,
				originalName: photo.originalName,
				contentType: photo.contentType,
				source: photo.source,
			},
			headers,
		});
		// The add handler returns only { ok }, so re-read the list to pick up the
		// new photo's id and signed URL (the only existing read path — no new
		// endpoint).
		const result = await listFurnitureItems({ data: {}, headers });
		const fresh = result.items.find((entry) => entry.id === item.id);
		// Only adopt the re-read when the item is present — a transient miss must
		// not wipe a gallery whose photo was just persisted.
		if (fresh) setPhotos(fresh.photos.slice().sort(activeFirst));
		await props.onPhotosChanged?.();
	}

	return (
		<Dialog
			onOpenChange={(open) => {
				if (!open) props.onClose();
			}}
			open={item !== null}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit furniture</DialogTitle>
					<DialogDescription>
						Fix the name or dimensions, and manage this piece's photos. Leave a
						dimension blank if you don't know it.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-3">
					<label className="grid gap-1 text-sm">
						<span>Name</span>
						<input
							className="rounded border border-border bg-background px-3 py-2 outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
							onChange={(event) => setLabel(event.target.value)}
							placeholder="e.g. white 4-drawer dresser"
							value={label}
						/>
					</label>
					<div className="grid grid-cols-3 gap-3">
						<label className="grid gap-1 text-sm">
							<span>Width (cm)</span>
							<input
								className="rounded border border-border bg-background px-3 py-2 outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
								inputMode="decimal"
								onChange={(event) => setWidth(event.target.value)}
								value={width}
							/>
						</label>
						<label className="grid gap-1 text-sm">
							<span>Height (cm)</span>
							<input
								className="rounded border border-border bg-background px-3 py-2 outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
								inputMode="decimal"
								onChange={(event) => setHeight(event.target.value)}
								value={height}
							/>
						</label>
						<label className="grid gap-1 text-sm">
							<span>Depth (cm)</span>
							<input
								className="rounded border border-border bg-background px-3 py-2 outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
								inputMode="decimal"
								onChange={(event) => setDepth(event.target.value)}
								value={depth}
							/>
						</label>
					</div>

					<div className="grid gap-2">
						<span className="font-medium text-sm">Photos</span>
						{photos.length > 0 ? (
							<ul className="m-0 grid list-none grid-cols-3 gap-2 p-0">
								{photos.map((photo) => (
									<li className="grid gap-1" key={photo.id}>
										<div className="relative">
											<button
												aria-label={
													photo.isActive
														? `${photo.originalName} (Reference Image)`
														: `Use ${photo.originalName} as the Reference Image`
												}
												aria-pressed={photo.isActive}
												className={cn(
													"block w-full overflow-hidden rounded border bg-background outline-none transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50",
													photo.isActive
														? "border-ring ring-[3px] ring-ring/40"
														: "border-border"
												)}
												disabled={photoBusy}
												onClick={() => void setActive(photo.id)}
												type="button"
											>
												{photo.signedUrl ? (
													<img
														alt={photo.originalName}
														className="block aspect-square w-full object-cover"
														src={photo.signedUrl}
													/>
												) : (
													<div className="aspect-square w-full bg-muted" />
												)}
											</button>
											{photo.isActive ? (
												<span className="absolute top-1 left-1 rounded bg-ring px-1.5 py-0.5 font-medium text-[0.6875rem] text-background">
													Reference Image
												</span>
											) : null}
										</div>
										<Button
											aria-label={`Delete ${photo.originalName}`}
											className="w-full"
											disabled={photoBusy || photos.length <= 1}
											onClick={() => void removePhoto(photo.id)}
											size="sm"
											type="button"
											variant="outline"
										>
											<Trash2 aria-hidden="true" className="size-3.5" />
										</Button>
									</li>
								))}
							</ul>
						) : null}
						{photos.length === 1 ? (
							<p className="m-0 text-ink-muted text-sm">
								An item keeps at least one photo. To remove this piece entirely,
								delete the item instead.
							</p>
						) : null}
						<FurniturePhotoPicker
							confirmLabel="Add photo"
							confirmPendingLabel="Adding…"
							disabled={photoBusy || photos.length >= MAX_FURNITURE_PHOTOS}
							idleLabel="Add photo"
							onConfirm={addPhoto}
						/>
						{photos.length >= MAX_FURNITURE_PHOTOS ? (
							<p className="m-0 text-ink-muted text-sm">
								This item has the maximum of {MAX_FURNITURE_PHOTOS} photos.
							</p>
						) : null}
						{photoError ? (
							<p className="m-0 text-sm text-warning" role="alert">
								{photoError}
							</p>
						) : null}
					</div>

					{error ? (
						<p className="m-0 text-sm text-warning" role="alert">
							{error}
						</p>
					) : null}
				</div>
				<DialogFooter>
					<DialogClose asChild>
						<Button disabled={saving} type="button" variant="outline">
							Cancel
						</Button>
					</DialogClose>
					<Button disabled={saving} onClick={() => void save()} type="button">
						{saving ? "Saving…" : "Save changes"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
