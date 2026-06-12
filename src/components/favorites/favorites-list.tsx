import { Link } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	getAuthHeaders,
	UNAUTHENTICATED_ERROR,
} from "../../lib/server-client/auth-headers";
import {
	type FavoriteImagePayload,
	listFavoriteImages,
	setImageFavorite,
} from "../../server/generation";

export function FavoritesList() {
	const [images, setImages] = useState<FavoriteImagePayload[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const cancelledRef = useRef(false);

	useEffect(() => {
		cancelledRef.current = false;
		(async () => {
			try {
				const headers = await getAuthHeaders();
				const result = await listFavoriteImages({ headers });
				if (cancelledRef.current) return;
				setImages(result.images);
			} catch (caught) {
				if (cancelledRef.current) return;
				if (
					caught instanceof Error &&
					caught.message === UNAUTHENTICATED_ERROR
				) {
					window.location.assign("/sign-in");
					return;
				}
				setError(
					caught instanceof Error ? caught.message : "Failed to load favorites"
				);
			} finally {
				if (!cancelledRef.current) setLoading(false);
			}
		})();
		return () => {
			cancelledRef.current = true;
		};
	}, []);

	async function removeFavorite(image: FavoriteImagePayload) {
		// Optimistic removal — restore on error.
		setImages((prev) => prev?.filter((entry) => entry.id !== image.id) ?? prev);
		try {
			const headers = await getAuthHeaders();
			await setImageFavorite({
				data: { imageId: image.id, isFavorite: false },
				headers,
			});
		} catch (caught) {
			if (cancelledRef.current) return;
			if (caught instanceof Error && caught.message === UNAUTHENTICATED_ERROR) {
				window.location.assign("/sign-in");
				return;
			}
			setImages((prev) => {
				if (!prev) return prev;
				return [...prev, image].sort((a, b) =>
					b.createdAt.localeCompare(a.createdAt)
				);
			});
			setError(
				caught instanceof Error ? caught.message : "Failed to update favorite"
			);
		}
	}

	return (
		<section className="grid gap-6">
			<header className="grid gap-1.5">
				<h1 className="m-0 font-body font-semibold text-[1.625rem] text-foreground tracking-tight">
					Favorites
				</h1>
				<p className="m-0 max-w-[58ch] font-body text-[0.9375rem] text-ink-muted leading-6">
					Generated concepts you marked as favorites, across all projects.
				</p>
			</header>

			{loading ? (
				<div className="grid gap-6 md:grid-cols-2">
					{[0, 1].map((i) => (
						<article
							className="grid min-h-[360px] grid-rows-[1fr_auto] overflow-hidden border border-border bg-popover"
							key={i}
						>
							<Skeleton className="aspect-[4/3] w-full rounded-none" />
							<div className="flex items-center justify-between gap-3 border-border border-t px-5 py-3">
								<div className="grid gap-1.5">
									<Skeleton className="h-3.5 w-[140px]" />
									<Skeleton className="h-3 w-[180px]" />
								</div>
								<Skeleton className="h-8 w-28" />
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

			{images && images.length === 0 && !error ? (
				<div className="rounded-lg border border-border border-dashed bg-surface px-6 py-10 text-center">
					<p className="m-0 font-medium text-[0.9375rem] text-foreground">
						No favorites yet
					</p>
					<p className="m-0 mt-1 text-[0.875rem] text-ink-muted">
						Mark generated variations as favorites to collect them here.
					</p>
				</div>
			) : null}

			{images && images.length > 0 ? (
				<div className="grid gap-6 md:grid-cols-2">
					{images.map((image) => (
						<article
							className="grid min-h-[360px] grid-rows-[1fr_auto_auto] overflow-hidden border border-border bg-popover"
							key={image.id}
						>
							<img
								alt={`Variation ${image.variationIndex + 1} — ${image.projectName}`}
								className="block aspect-[4/3] w-full bg-background object-cover"
								src={image.signedUrl}
							/>
							<div className="flex items-center justify-between gap-3 border-border border-t px-5 py-3">
								<div className="min-w-0">
									<Link
										className="block truncate font-body font-medium text-[0.9375rem] text-foreground hover:underline"
										params={{
											projectId: image.projectId,
											taskId: image.taskId,
										}}
										to="/projects/$projectId/tasks/$taskId"
									>
										{image.projectName}
									</Link>
									<span className="mt-0.5 block truncate text-[0.8125rem] text-ink-muted">
										{image.taskTitle}
										{" · "}
										{`Variation ${String(image.variationIndex + 1).padStart(2, "0")}`}
									</span>
								</div>
								<Button
									aria-label={`Remove ${image.projectName} variation ${image.variationIndex + 1} from favorites`}
									className="shrink-0 gap-1.5 border-gold text-gold"
									onClick={() => void removeFavorite(image)}
									size="sm"
									type="button"
									variant="outline"
								>
									<Star className="size-3.5 fill-gold text-gold" />
									Favorite
								</Button>
							</div>
							{image.contents && image.contents.length > 0 ? (
								<p className="m-0 border-border border-t px-5 py-3 text-[0.8125rem] text-ink-muted leading-relaxed">
									<span className="font-semibold text-[0.6875rem] text-ink-subtle uppercase tracking-[0.06em]">
										In this room:{" "}
									</span>
									{image.contents.join(", ")}
								</p>
							) : null}
						</article>
					))}
				</div>
			) : null}
		</section>
	);
}
