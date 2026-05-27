import { Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ProviderDebug } from "@/lib/ai/types";
import { cn } from "@/lib/utils";
import {
	getAuthHeaders,
	UNAUTHENTICATED_ERROR,
} from "../../lib/server-client/auth-headers";
import {
	generateRenovationImages,
	setImageFavorite,
} from "../../server/generation";
import { DebugPanel } from "./debug-panel";

/**
 * Variation cards rendered after a successful generation call. Each entry is
 * a server-persisted `generated_images` row with a fresh signed URL minted
 * by the server fn so the browser can render the asset without re-querying.
 */
type GeneratedImage = {
	id: string;
	storagePath: string;
	signedUrl: string;
	variationIndex: number;
	isFavorite: boolean;
};

const VARIATION_COUNT = 4;

/**
 * Step 4 of the guided flow: kick off generation and render the variations.
 *
 * On mount we call `generateRenovationImages` once with the current prompt;
 * the user can re-run via "Generate variations". Each card carries a
 * favorite toggle backed by the `setImageFavorite` server fn so the
 * preference is persisted, but local state is mirrored optimistically so the
 * UI doesn't wait on the round-trip before flipping the star.
 *
 * The component intentionally does NOT load previously-persisted images on
 * mount — once we have a `listGeneratedImages` server fn we can switch the
 * effect from "always generate" to "load then optionally regenerate".
 */
export function GenerationStep(props: {
	taskId: string;
	briefId: string | null;
	brief: string;
	prompt: string;
	photoId?: string | null;
}) {
	const [images, setImages] = useState<GeneratedImage[] | null>(null);
	const [debug, setDebug] = useState<ProviderDebug | null>(null);
	const [generating, setGenerating] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const cancelledRef = useRef(false);

	useEffect(() => {
		cancelledRef.current = false;
		return () => {
			cancelledRef.current = true;
		};
	}, []);

	async function runGeneration() {
		if (props.prompt.trim().length === 0) {
			setError("No prompt available — generate a brief first.");
			return;
		}
		setError(null);
		setGenerating(true);
		try {
			const headers = await getAuthHeaders();
			const response = (await generateRenovationImages({
				data: {
					taskId: props.taskId,
					briefId: props.briefId,
					prompt: props.prompt,
					count: VARIATION_COUNT,
					photoId: props.photoId ?? null,
				},
				headers,
			})) as {
				data: { jobId: string; images: GeneratedImage[] };
				debug?: ProviderDebug;
			};
			if (cancelledRef.current) return;
			setImages(response.data.images);
			setDebug(response.debug ?? null);
		} catch (caught) {
			if (cancelledRef.current) return;
			if (caught instanceof Error && caught.message === UNAUTHENTICATED_ERROR) {
				window.location.assign("/auth");
				return;
			}
			setError(
				caught instanceof Error ? caught.message : "Failed to generate images",
			);
		} finally {
			if (!cancelledRef.current) setGenerating(false);
		}
	}

	// Kick off the first generation as soon as we have a prompt. Re-runs are
	// driven by the explicit button below — we don't auto-regenerate when the
	// prompt changes so the user doesn't burn API credits on every keystroke
	// upstream.
	const initialRunRef = useRef(false);
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional one-shot mount effect; re-runs are user-driven via the button.
	useEffect(() => {
		if (initialRunRef.current) return;
		if (props.prompt.trim().length === 0) return;
		initialRunRef.current = true;
		void runGeneration();
	}, []);

	async function toggleFavorite(image: GeneratedImage) {
		const nextValue = !image.isFavorite;
		// Optimistic flip — revert on error.
		setImages(
			(prev) =>
				prev?.map((entry) =>
					entry.id === image.id ? { ...entry, isFavorite: nextValue } : entry,
				) ?? prev,
		);
		try {
			const headers = await getAuthHeaders();
			await setImageFavorite({
				data: { imageId: image.id, isFavorite: nextValue },
				headers,
			});
		} catch (caught) {
			if (cancelledRef.current) return;
			if (caught instanceof Error && caught.message === UNAUTHENTICATED_ERROR) {
				window.location.assign("/auth");
				return;
			}
			// Revert the optimistic flip and surface the failure inline.
			setImages(
				(prev) =>
					prev?.map((entry) =>
						entry.id === image.id
							? { ...entry, isFavorite: image.isFavorite }
							: entry,
					) ?? prev,
			);
			setError(
				caught instanceof Error ? caught.message : "Failed to update favorite",
			);
		}
	}

	const showBriefMissing =
		props.brief.length === 0 && images === null && !generating;

	return (
		<div
			aria-busy={generating}
			className="grid gap-6 border border-border bg-surface p-10 max-md:p-6"
		>
			<header className="grid gap-2">
				<h2 className="m-0 font-display font-medium text-2xl text-foreground tracking-tight">
					4. Review generated variations
				</h2>
				<p className="m-0 max-w-[60ch] font-body text-[0.9375rem] text-ink-muted leading-relaxed">
					Generated images are visual concepts, not construction plans. Mark
					favorites to compare or share.
				</p>
			</header>

			{import.meta.env.MODE !== "production" && (
				<details className="rounded-md border border-border bg-popover p-3">
					<summary className="cursor-pointer select-none font-body font-semibold text-[0.6875rem] text-ink-muted uppercase tracking-wider">
						Show prompt sent to provider
					</summary>
					<pre className="m-0 mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[0.8125rem] text-ink">
						{props.prompt || "(prompt not generated yet)"}
					</pre>
				</details>
			)}

			<div className="flex flex-wrap items-center gap-4">
				<Button
					disabled={generating || props.prompt.trim().length === 0}
					onClick={() => void runGeneration()}
					type="button"
				>
					{generating
						? `Generating ${VARIATION_COUNT} variations…`
						: images
							? "Re-generate variations"
							: "Generate variations"}
				</Button>
				{error ? (
					<p
						className="m-0 flex items-center gap-2 font-medium text-[0.9375rem] text-warning"
						role="alert"
					>
						{error}{" "}
						<Button
							onClick={() => void runGeneration()}
							size="sm"
							type="button"
							variant="outline"
						>
							Try again
						</Button>
					</p>
				) : null}
			</div>

			{generating ? (
				<output className="block text-[0.9375rem] text-ink-muted italic">
					Generating {VARIATION_COUNT} variations…
				</output>
			) : null}

			{images && images.length > 0 ? (
				<div className="grid gap-6 md:grid-cols-2">
					{images.map((image) => (
						<article
							className="generation-card grid min-h-[360px] grid-rows-[1fr_auto] overflow-hidden border border-border bg-popover"
							key={image.id}
						>
							<img
								alt={`Variation ${image.variationIndex + 1}`}
								className="block aspect-[4/3] w-full bg-background object-cover"
								src={image.signedUrl}
							/>
							<div className="flex items-center justify-between gap-3 border-border border-t px-5 py-3">
								<span className="font-body font-semibold text-[0.6875rem] text-ink-subtle uppercase tracking-[0.06em]">
									{`Variation ${String(image.variationIndex + 1).padStart(2, "0")}`}
								</span>
								<Button
									aria-pressed={image.isFavorite}
									className={cn(
										"gap-1.5",
										image.isFavorite && "border-gold text-gold",
									)}
									onClick={() => void toggleFavorite(image)}
									size="sm"
									type="button"
									variant="outline"
								>
									<Star
										className={cn(
											"size-3.5",
											image.isFavorite && "fill-gold text-gold",
										)}
									/>
									{image.isFavorite ? "Favorite" : "Mark favorite"}
								</Button>
							</div>
						</article>
					))}
				</div>
			) : null}

			<p
				className="m-0 border-warning border-l-2 bg-warning/5 py-2 pl-4 text-[0.875rem] text-ink-muted italic"
				role="note"
			>
				Generated outputs are visual concepts and need human review before
				construction decisions.
			</p>

			{showBriefMissing ? (
				<p className="m-0 text-[0.9375rem] text-ink-muted italic">
					No brief yet — go back to the brief step to generate one.
				</p>
			) : null}

			<DebugPanel debug={debug} label="Generation" />
		</div>
	);
}
