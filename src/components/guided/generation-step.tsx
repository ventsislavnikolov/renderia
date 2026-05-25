import { useState } from "react";

/**
 * Step 4 of the guided flow: present generated variations.
 *
 * The current MVP renders placeholder cards because image generation is not
 * yet exposed as a server function — the plan defers that wiring to a later
 * task. We keep the favorite-toggle in component state so the UI behavior is
 * complete from the user's perspective and the future server fn only needs
 * to land alongside a `saveFavoriteImage` mutation.
 *
 * Showing the in-progress prompt lets the user verify the brief flowed
 * through correctly before any real provider call lands.
 */
export function GenerationStep(props: { brief: string; prompt: string }) {
	const VARIATION_COUNT = 4;
	const [favorites, setFavorites] = useState<Set<number>>(new Set());

	function toggleFavorite(index: number) {
		setFavorites((prev) => {
			const next = new Set(prev);
			if (next.has(index)) {
				next.delete(index);
			} else {
				next.add(index);
			}
			return next;
		});
	}

	return (
		<div className="guided-step">
			<header className="guided-step-header">
				<h2>4. Review generated variations</h2>
				<p>
					Generated images are visual concepts, not construction plans. Mark
					favorites to compare or share.
				</p>
			</header>

			<details className="guided-prompt-debug">
				<summary>Show prompt sent to provider</summary>
				<pre>{props.prompt || "(prompt not generated yet)"}</pre>
			</details>

			<div className="generation-grid">
				{Array.from({ length: VARIATION_COUNT }, (_, index) => {
					const isFavorite = favorites.has(index);
					return (
						// biome-ignore lint/suspicious/noArrayIndexKey: placeholder cards have a fixed identity-by-position; real generation outputs will key on a server-assigned id.
						<article className="generation-card" key={`variation-${index}`}>
							<div className="generation-preview" aria-hidden="true">
								Variation {index + 1}
							</div>
							<div className="generation-card-actions">
								<button
									type="button"
									onClick={() => toggleFavorite(index)}
									aria-pressed={isFavorite}
								>
									{isFavorite ? "★ Favorite" : "☆ Mark favorite"}
								</button>
							</div>
						</article>
					);
				})}
			</div>

			<p className="concept-warning" role="note">
				Generated outputs are visual concepts and need human review before
				construction decisions.
			</p>

			{props.brief.length === 0 ? (
				<p className="workspace-status">
					No brief yet — go back to the brief step to generate one.
				</p>
			) : null}
		</div>
	);
}
