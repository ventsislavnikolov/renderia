import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The three loading phases a signed-URL photo tile moves through:
 * - `loading` — the parent is still minting the Supabase signed URL.
 * - `ready` — a URL exists; the `<img>` is downloading/decoding the bytes.
 * - `error` — the signed URL could not be minted (parent recorded a failure).
 *
 * `ready` only means "URL in hand"; the tile keeps the skeleton up internally
 * until the `<img>` actually fires `onLoad`, so phase 2 (URL) and phase 3
 * (bytes) are both covered and the user never sees a blank card flash.
 */
export type PhotoTileStatus = "loading" | "ready" | "error";

/**
 * Presentational photo tile with a built-in loading skeleton and error
 * fallback. Callers own the signed-URL lifecycle and pass `status` + `url`
 * down; this component owns the skeleton, the `onLoad`/`onError` latch, and the
 * "couldn't load" placeholder so the four guided-flow steps don't each
 * reimplement it.
 *
 * Layout: by default (`fill`) the `<img>` is absolutely stretched to a sizing
 * box the caller defines via `className` (e.g. `aspect-[4/3] w-full`), so the
 * skeleton and image share the exact same footprint with zero layout shift.
 * Pass `fill={false}` for an intrinsic-height image (e.g. the overlay canvas)
 * where the photo's natural ratio must drive the box; give `className` a
 * `min-h-*` so the skeleton has somewhere to sit while bytes load.
 */
export function PhotoTile(props: {
	status: PhotoTileStatus;
	url: string | null;
	alt: string;
	/** Sizing/border classes for the tile box (e.g. `aspect-[4/3] w-full`). */
	className?: string;
	/** Object-fit and friends for the `<img>` (e.g. `object-cover`). */
	imageClassName?: string;
	/** Stretch the image to fill the box (default) vs. flow at natural height. */
	fill?: boolean;
}) {
	const { status, url, alt, className, imageClassName, fill = true } = props;
	const [loaded, setLoaded] = useState(false);
	const [errored, setErrored] = useState(false);
	// Reset the load/error latch whenever the URL changes so a re-minted signed
	// URL re-shows the skeleton instead of flashing the previous frame. This
	// render-phase reset is React's recommended alternative to a useEffect.
	const [renderedUrl, setRenderedUrl] = useState(url);
	if (url !== renderedUrl) {
		setRenderedUrl(url);
		setLoaded(false);
		setErrored(false);
	}

	const showError = status === "error" || errored;
	// Skeleton covers both the URL-minting wait and the image-bytes download.
	const showSkeleton = !showError && (status === "loading" || !url || !loaded);

	return (
		<div className={cn("relative overflow-hidden bg-background", className)}>
			{url && status !== "loading" && !showError ? (
				<img
					alt={alt}
					className={cn(
						fill ? "absolute inset-0 h-full w-full" : "block w-full",
						"transition-opacity duration-200",
						loaded ? "opacity-100" : "opacity-0",
						imageClassName
					)}
					decoding="async"
					loading="lazy"
					onError={() => setErrored(true)}
					onLoad={() => setLoaded(true)}
					src={url}
				/>
			) : null}
			{showSkeleton ? (
				<Skeleton className="absolute inset-0 h-full w-full rounded-none" />
			) : null}
			{showError ? (
				<div className="absolute inset-0 flex items-center justify-center bg-background px-4 text-center">
					<span className="font-body text-[0.8125rem] text-destructive">
						Couldn’t load image
					</span>
				</div>
			) : null}
		</div>
	);
}
