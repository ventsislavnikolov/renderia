import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { track } from "../../lib/analytics/track";
import { MAX_FURNITURE_PHOTOS } from "../../lib/renovation/schema";
import {
	getAuthHeaders,
	UNAUTHENTICATED_ERROR,
} from "../../lib/server-client/auth-headers";
import {
	extractFurnitureCandidate,
	importFurnitureItem,
} from "../../server/furniture-import";

type Candidate = {
	name: string | null;
	photos: string[];
	brand: string | null;
	price: number | null;
	currency: string | null;
};

type Draft = {
	sourceUrl: string;
	label: string;
	brand: string;
	price: string;
	currency: string;
	photos: string[];
	/** Parallel to `photos`: which extracted photos to keep on the item. */
	kept: boolean[];
	/** Index into `photos` of the active Reference Image (always a kept photo). */
	activePhoto: number;
};

/** Blank → null; a non-negative finite number → that number; else undefined (invalid). */
function parsePrice(raw: string): number | null | undefined {
	const trimmed = raw.trim();
	if (trimmed === "") return null;
	const parsed = Number(trimmed);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function emptyToNull(raw: string): string | null {
	const trimmed = raw.trim();
	return trimmed.length > 0 ? trimmed : null;
}

/**
 * Link Import on the Furniture page: paste a retailer product URL, the server
 * fetches and extracts a candidate, and an editable confirm form pre-fills.
 * The user edits any field, chooses which extracted photos to keep (default:
 * all, capped at {@link MAX_FURNITURE_PHOTOS}) and which kept photo is the
 * Reference Image, then confirms — the server downloads every kept photo into
 * the furniture bucket and inserts the item with one photo row per photo and
 * its Source Link. Nothing persists before confirm; cancel discards the draft.
 */
export function LinkImport(props: {
	disabled?: boolean;
	onSaved: (created: { id: string }) => void | Promise<void>;
}) {
	const [url, setUrl] = useState("");
	const [extracting, setExtracting] = useState(false);
	const [draft, setDraft] = useState<Draft | null>(null);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	function handleAuthError(caught: unknown): boolean {
		if (caught instanceof Error && caught.message === UNAUTHENTICATED_ERROR) {
			window.location.assign("/sign-in");
			return true;
		}
		return false;
	}

	function resetDraft() {
		setDraft(null);
		setUrl("");
		setError(null);
	}

	async function startImport() {
		const trimmed = url.trim();
		if (trimmed.length === 0 || extracting) return;
		setExtracting(true);
		setError(null);
		try {
			const headers = await getAuthHeaders();
			const result = await extractFurnitureCandidate({
				data: { url: trimmed },
				headers,
			});
			const candidate = result.candidate as Candidate;
			setDraft({
				sourceUrl: result.sourceUrl,
				label: candidate.name ?? "",
				brand: candidate.brand ?? "",
				price: candidate.price === null ? "" : String(candidate.price),
				currency: candidate.currency ?? "",
				photos: candidate.photos,
				// Default: keep all extracted photos, capped at the per-item maximum.
				kept: candidate.photos.map((_, index) => index < MAX_FURNITURE_PHOTOS),
				activePhoto: 0,
			});
		} catch (caught) {
			if (handleAuthError(caught)) return;
			setError(
				caught instanceof Error
					? caught.message
					: "Couldn't import that link. Add the item manually instead."
			);
		} finally {
			setExtracting(false);
		}
	}

	/** Toggle whether a photo is kept, never dropping below one kept photo and
	 * never exceeding the cap; promote another kept photo if the active one goes. */
	function toggleKeep(index: number) {
		setDraft((prev) => {
			if (!prev) return prev;
			const kept = prev.kept.slice();
			const next = !kept[index];
			const keptCount = kept.filter(Boolean).length;
			if (!next && keptCount <= 1) return prev;
			if (next && keptCount >= MAX_FURNITURE_PHOTOS) return prev;
			kept[index] = next;
			const activePhoto =
				!next && index === prev.activePhoto
					? kept.findIndex(Boolean)
					: prev.activePhoto;
			return { ...prev, kept, activePhoto };
		});
	}

	function setActivePhoto(index: number) {
		setDraft((prev) =>
			prev && prev.kept[index] ? { ...prev, activePhoto: index } : prev
		);
	}

	async function confirmImport() {
		if (!draft || saving) return;
		const label = draft.label.trim();
		const keptIndices = draft.photos
			.map((_, index) => index)
			.filter((index) => draft.kept[index]);
		const photoUrls = keptIndices.map((index) => draft.photos[index]);
		const activePhotoIndex = Math.max(
			0,
			keptIndices.indexOf(draft.activePhoto)
		);
		if (label.length === 0 || photoUrls.length === 0) return;
		const price = parsePrice(draft.price);
		if (price === undefined) {
			setError("Price must be a non-negative number, or left blank.");
			return;
		}
		setSaving(true);
		setError(null);
		try {
			const headers = await getAuthHeaders();
			const created = await importFurnitureItem({
				data: {
					sourceUrl: draft.sourceUrl,
					photoUrls,
					activePhotoIndex,
					label,
					brand: emptyToNull(draft.brand),
					price,
					currency: emptyToNull(draft.currency),
					widthCm: null,
					heightCm: null,
					depthCm: null,
				},
				headers,
			});
			track("furniture_imported");
			await props.onSaved({ id: created.id });
			resetDraft();
		} catch (caught) {
			if (handleAuthError(caught)) return;
			setError(
				caught instanceof Error ? caught.message : "Failed to save furniture"
			);
		} finally {
			setSaving(false);
		}
	}

	if (!draft) {
		return (
			<div className="grid gap-2">
				<div className="flex flex-wrap items-center gap-3">
					<label
						className="flex min-w-[16rem] flex-1 flex-col gap-1 text-sm"
						htmlFor="link-import-url"
					>
						<span className="sr-only">Product link to import</span>
						<Input
							id="link-import-url"
							onChange={(event) => setUrl(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									void startImport();
								}
							}}
							placeholder="Paste a product link (e.g. a Jysk or IKEA page)"
							type="url"
							value={url}
						/>
					</label>
					<Button
						disabled={props.disabled || extracting || url.trim().length === 0}
						onClick={() => void startImport()}
						type="button"
						variant="outline"
					>
						{extracting ? "Importing…" : "Import from link"}
					</Button>
				</div>
				{error ? (
					<p className="m-0 text-sm text-warning" role="alert">
						{error}
					</p>
				) : null}
			</div>
		);
	}

	const hasPhotos = draft.photos.length > 0;

	return (
		<div className="grid gap-4 rounded border border-border p-4">
			<div className="grid gap-1">
				<h2 className="m-0 font-body font-semibold text-[1.0625rem] text-foreground">
					Confirm import
				</h2>
				<p className="m-0 break-all text-[0.8125rem] text-ink-muted">
					From {draft.sourceUrl}
				</p>
			</div>

			{hasPhotos ? (
				<fieldset className="m-0 grid gap-2 border-0 p-0">
					<legend className="mb-1 p-0 text-sm">
						Keep the photos you want and pick the Reference Image
					</legend>
					<div className="flex flex-wrap gap-3">
						{draft.photos.map((photo, index) => {
							const kept = draft.kept[index];
							const active = index === draft.activePhoto;
							const keptCount = draft.kept.filter(Boolean).length;
							const keepDisabled =
								(kept && keptCount <= 1) ||
								(!kept && keptCount >= MAX_FURNITURE_PHOTOS);
							return (
								<div className="grid gap-1" key={photo}>
									<button
										aria-label={`Use photo ${index + 1} as the Reference Image`}
										aria-pressed={active}
										className={cn(
											"relative h-24 w-24 overflow-hidden rounded border-2 bg-background",
											"focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
											"disabled:opacity-50",
											active ? "border-gold" : "border-border"
										)}
										disabled={!kept}
										onClick={() => setActivePhoto(index)}
										type="button"
									>
										<img
											alt={`Product option ${index + 1}`}
											className={cn(
												"h-full w-full object-cover",
												kept ? "" : "opacity-40"
											)}
											src={photo}
										/>
										{active ? (
											<span className="absolute top-1 left-1 rounded bg-ring px-1.5 py-0.5 font-medium text-[0.625rem] text-background">
												Reference
											</span>
										) : null}
									</button>
									<label className="flex items-center gap-1 text-[0.75rem]">
										<input
											aria-label={`Keep photo ${index + 1}`}
											checked={kept}
											disabled={keepDisabled}
											onChange={() => toggleKeep(index)}
											type="checkbox"
										/>
										Keep
									</label>
								</div>
							);
						})}
					</div>
				</fieldset>
			) : (
				<p className="m-0 text-ink-muted text-sm">
					No photos were found on that page. You can still save the details, or
					add a photo manually instead.
				</p>
			)}

			<label
				className="grid max-w-md gap-1 text-sm"
				htmlFor="link-import-label"
			>
				<span>What is this piece?</span>
				<Input
					id="link-import-label"
					onChange={(event) =>
						setDraft((prev) =>
							prev ? { ...prev, label: event.target.value } : prev
						)
					}
					placeholder="e.g. GISTRUP 3-seat sofa"
					value={draft.label}
				/>
			</label>

			<label
				className="grid max-w-md gap-1 text-sm"
				htmlFor="link-import-brand"
			>
				<span>Brand</span>
				<Input
					id="link-import-brand"
					onChange={(event) =>
						setDraft((prev) =>
							prev ? { ...prev, brand: event.target.value } : prev
						)
					}
					placeholder="Optional"
					value={draft.brand}
				/>
			</label>

			<div className="flex flex-wrap gap-3">
				<label className="grid gap-1 text-sm" htmlFor="link-import-price">
					<span>Price</span>
					<Input
						className="w-32"
						id="link-import-price"
						inputMode="decimal"
						onChange={(event) =>
							setDraft((prev) =>
								prev ? { ...prev, price: event.target.value } : prev
							)
						}
						placeholder="Optional"
						value={draft.price}
					/>
				</label>
				<label className="grid gap-1 text-sm" htmlFor="link-import-currency">
					<span>Currency</span>
					<Input
						className="w-28"
						id="link-import-currency"
						onChange={(event) =>
							setDraft((prev) =>
								prev ? { ...prev, currency: event.target.value } : prev
							)
						}
						placeholder="e.g. BGN"
						value={draft.currency}
					/>
				</label>
			</div>

			{error ? (
				<p className="m-0 text-sm text-warning" role="alert">
					{error}
				</p>
			) : null}

			<div className="flex flex-wrap items-center gap-3">
				<Button
					disabled={saving || draft.label.trim().length === 0 || !hasPhotos}
					onClick={() => void confirmImport()}
					type="button"
				>
					{saving ? "Saving…" : "Save to library"}
				</Button>
				<Button
					disabled={saving}
					onClick={resetDraft}
					type="button"
					variant="outline"
				>
					Cancel
				</Button>
			</div>
		</div>
	);
}
