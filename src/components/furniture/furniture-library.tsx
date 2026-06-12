import { useCallback, useEffect, useRef, useState } from "react";
import { AddFurniture } from "@/components/furniture/add-furniture";
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
import {
	getAuthHeaders,
	UNAUTHENTICATED_ERROR,
} from "../../lib/server-client/auth-headers";
import {
	deleteFurnitureItem,
	listFurnitureItems,
} from "../../server/furniture";

type FurnitureItem = {
	id: string;
	label: string;
	source: "product" | "photo";
	originalName: string;
	signedUrl: string | null;
	selected: boolean;
	createdAt: string;
};

/**
 * The Furniture Library's management home: every item in the account as a
 * grid of cards, with manual add (product image as-is, or phone photo with
 * the crop flow) and delete. Tasks referencing a deleted item keep working —
 * the row delete only detaches the task links.
 */
export function FurnitureLibrary() {
	const [items, setItems] = useState<FurnitureItem[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [pendingDelete, setPendingDelete] = useState<FurnitureItem | null>(
		null
	);
	const [deleting, setDeleting] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);
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
			const result = await listFurnitureItems({ data: {}, headers });
			if (cancelledRef.current) return;
			setItems(result.items);
			setError(null);
		} catch (caught) {
			if (cancelledRef.current || handleAuthError(caught)) return;
			setError(
				caught instanceof Error ? caught.message : "Failed to load furniture"
			);
			setItems([]);
		}
	}, [handleAuthError]);

	useEffect(() => {
		cancelledRef.current = false;
		void refresh();
		return () => {
			cancelledRef.current = true;
		};
	}, [refresh]);

	async function confirmDelete() {
		const target = pendingDelete;
		if (!target) return;
		setDeleting(true);
		setDeleteError(null);
		try {
			const headers = await getAuthHeaders();
			await deleteFurnitureItem({
				data: { furnitureItemId: target.id },
				headers,
			});
			if (cancelledRef.current) return;
			setItems(
				(prev) => prev?.filter((entry) => entry.id !== target.id) ?? prev
			);
			setPendingDelete(null);
		} catch (caught) {
			if (cancelledRef.current || handleAuthError(caught)) return;
			setDeleteError(
				caught instanceof Error ? caught.message : "Failed to delete furniture"
			);
		} finally {
			if (!cancelledRef.current) setDeleting(false);
		}
	}

	return (
		<section className="grid gap-6">
			<header className="grid gap-1.5">
				<h1 className="m-0 font-body font-semibold text-[1.625rem] text-foreground tracking-tight">
					Furniture
				</h1>
				<p className="m-0 max-w-[58ch] font-body text-[0.9375rem] text-ink-muted leading-6">
					Your account-wide Furniture Library. Every piece here can be included
					in any room's generation.
				</p>
			</header>

			<AddFurniture onSaved={refresh} />

			{items === null && !error ? (
				<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
					{[0, 1, 2].map((i) => (
						<article
							className="grid overflow-hidden border border-border bg-popover"
							key={i}
						>
							<Skeleton className="aspect-square w-full rounded-none" />
							<div className="flex items-center justify-between gap-3 border-border border-t px-4 py-3">
								<div className="grid gap-1.5">
									<Skeleton className="h-3.5 w-[120px]" />
									<Skeleton className="h-3 w-[80px]" />
								</div>
								<Skeleton className="h-8 w-16" />
							</div>
						</article>
					))}
				</div>
			) : null}

			{error ? (
				<p
					className="m-0 rounded-lg border border-warning/25 bg-warning/5 px-4 py-3 font-medium text-[0.9375rem] text-warning"
					role="alert"
				>
					{error}
				</p>
			) : null}

			{items && items.length === 0 && !error ? (
				<div className="rounded-lg border border-border border-dashed bg-surface px-6 py-10 text-center">
					<p className="m-0 font-medium text-[0.9375rem] text-foreground">
						No furniture in your library yet
					</p>
					<p className="m-0 mt-1 text-[0.875rem] text-ink-muted">
						Add a product image, or a phone photo and mark the piece that
						counts.
					</p>
				</div>
			) : null}

			{items && items.length > 0 ? (
				<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
					{items.map((item) => (
						<article
							className="grid overflow-hidden border border-border bg-popover"
							key={item.id}
						>
							{item.signedUrl ? (
								<img
									alt={item.label}
									className="block aspect-square w-full bg-background object-cover"
									src={item.signedUrl}
								/>
							) : (
								<div className="aspect-square w-full bg-muted" />
							)}
							<div className="flex items-center justify-between gap-3 border-border border-t px-4 py-3">
								<div className="min-w-0">
									<div className="truncate font-body font-medium text-[0.9375rem] text-foreground">
										{item.label}
									</div>
									<div className="mt-0.5 text-[0.8125rem] text-ink-muted">
										{item.source === "product" ? "Product image" : "From photo"}
									</div>
								</div>
								<Button
									aria-label={`Delete ${item.label}`}
									className="shrink-0"
									onClick={() => setPendingDelete(item)}
									size="sm"
									type="button"
									variant="outline"
								>
									Delete
								</Button>
							</div>
						</article>
					))}
				</div>
			) : null}

			<Dialog
				onOpenChange={(open) => {
					if (!open) {
						setPendingDelete(null);
						setDeleteError(null);
					}
				}}
				open={pendingDelete !== null}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete furniture?</DialogTitle>
						<DialogDescription>
							This permanently removes "{pendingDelete?.label}" from your
							library. Rooms that already used it keep their generated images.
						</DialogDescription>
					</DialogHeader>
					{deleteError ? (
						<p className="m-0 text-sm text-warning" role="alert">
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
							onClick={() => void confirmDelete()}
							type="button"
							variant="destructive"
						>
							{deleting ? "Deleting…" : "Delete furniture"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</section>
	);
}
