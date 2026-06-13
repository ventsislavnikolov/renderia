import { useCallback, useEffect, useRef, useState } from "react";
import { AddFurniture } from "@/components/furniture/add-furniture";
import { FurnitureMeta } from "@/components/furniture/furniture-meta";
import { Button } from "@/components/ui/button";
import {
	getAuthHeaders,
	UNAUTHENTICATED_ERROR,
} from "../../lib/server-client/auth-headers";
import {
	deleteFurnitureItem,
	listFurnitureItems,
	setTaskFurniture,
} from "../../server/furniture";

const MAX_SELECTED = 8;

type FurnitureItem = {
	id: string;
	label: string;
	source: "product" | "photo";
	originalName: string;
	signedUrl: string | null;
	selected: boolean;
	createdAt: string;
	sourceLink: string | null;
	brand: string | null;
	price: number | null;
	currency: string | null;
	widthCm: number | null;
	heightCm: number | null;
	depthCm: number | null;
};

/**
 * Account-wide Furniture Library, rendered inside the generation step. Users
 * add furniture from product images (used as-is) or phone photos (a
 * draggable crop box marks which piece counts), then tick which items to
 * include — the selection persists per task and rides into generation as
 * extra reference images. Every item in the account is offered, whichever
 * project it was added from.
 */
export function FurniturePicker(props: {
	taskId: string;
	disabled?: boolean;
	onSelectionChange: (ids: string[]) => void;
}) {
	const [items, setItems] = useState<FurnitureItem[] | null>(null);
	const [error, setError] = useState<string | null>(null);
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
				data: { taskId: props.taskId },
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
	}, [props.taskId, props.onSelectionChange, handleAuthError]);

	useEffect(() => {
		cancelledRef.current = false;
		void refresh();
		return () => {
			cancelledRef.current = true;
		};
	}, [refresh]);

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
				data: { furnitureItemId: item.id },
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

	// Auto-include the new piece — the user added it intending to use it.
	async function handleSaved(created: { id: string }) {
		const currentIds = (items ?? [])
			.filter((entry) => entry.selected)
			.map((entry) => entry.id);
		if (currentIds.length < MAX_SELECTED) {
			await persistSelection([...currentIds, created.id]);
		}
		await refresh();
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
								<FurnitureMeta
									brand={item.brand}
									currency={item.currency}
									depthCm={item.depthCm}
									heightCm={item.heightCm}
									price={item.price}
									sourceLink={item.sourceLink}
									widthCm={item.widthCm}
								/>
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
					No furniture in your library yet.
				</p>
			) : null}

			<AddFurniture disabled={props.disabled} onSaved={handleSaved}>
				{selectedCount > 0 ? (
					<span className="text-ink-muted text-sm">
						{selectedCount} piece{selectedCount === 1 ? "" : "s"} will be
						included in the next generation.
					</span>
				) : null}
			</AddFurniture>

			{error ? (
				<p className="m-0 text-sm text-warning" role="alert">
					{error}
				</p>
			) : null}
		</section>
	);
}
