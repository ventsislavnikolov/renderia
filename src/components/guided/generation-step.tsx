import { useEffect, useRef, useState } from "react";
import type { ProviderDebug } from "../../lib/ai/types";
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
		<div className="guided-step" aria-busy={generating}>
			<header className="guided-step-header">
				<h2>4. Review generated variations</h2>
				<p>
					Generated images are visual concepts, not construction plans. Mark
					favorites to compare or share.
				</p>
			</header>

			{import.meta.env.MODE !== "production" && (
				<details className="guided-prompt-debug">
					<summary>Show prompt sent to provider</summary>
					<pre>{props.prompt || "(prompt not generated yet)"}</pre>
				</details>
			)}

			<div className="guided-actions">
				<button
					type="button"
					onClick={() => void runGeneration()}
					disabled={generating || props.prompt.trim().length === 0}
				>
					{generating
						? `Generating ${VARIATION_COUNT} variations…`
						: images
							? "Re-generate variations"
							: "Generate variations"}
				</button>
				{error ? (
					<p role="alert">
						{error}{" "}
						<button type="button" onClick={() => void runGeneration()}>
							Try again
						</button>
					</p>
				) : null}
			</div>

			{generating ? (
				<output className="workspace-status">
					Generating {VARIATION_COUNT} variations…
				</output>
			) : null}

			{images && images.length > 0 ? (
				<div className="generation-grid">
					{images.map((image) => (
						<article className="generation-card" key={image.id}>
							<img
								src={image.signedUrl}
								alt={`Variation ${image.variationIndex + 1}`}
							/>
							<div className="generation-card-actions">
								<span className="generation-card-label">
									{`Variation ${String(image.variationIndex + 1).padStart(2, "0")}`}
								</span>
								<button
									type="button"
									onClick={() => void toggleFavorite(image)}
									aria-pressed={image.isFavorite}
								>
									{image.isFavorite ? "★ Favorite" : "☆ Mark favorite"}
								</button>
							</div>
						</article>
					))}
				</div>
			) : null}

			<p className="concept-warning" role="note">
				Generated outputs are visual concepts and need human review before
				construction decisions.
			</p>

			{showBriefMissing ? (
				<p className="workspace-status">
					No brief yet — go back to the brief step to generate one.
				</p>
			) : null}

			<DebugPanel debug={debug} label="Generation" />
		</div>
	);
}
