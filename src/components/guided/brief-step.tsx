import { useDeferredValue, useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import type { BoundingBox } from "../../lib/ai/types";
import {
	getAuthHeaders,
	UNAUTHENTICATED_ERROR,
} from "../../lib/server-client/auth-headers";
import { createDesignBrief } from "../../server/generation";

/**
 * Maximum chars accepted by `createDesignBriefSchema.styleRules` and
 * `protectedElementSchema` array shape. Kept locally so the textarea hard cap
 * matches the server validator without an extra round-trip on submission.
 */
const STYLE_RULES_MAX = 4000;
const BRIEF_MAX = 8000;

/**
 * Step 3 of the guided flow: generate and edit the design brief.
 *
 * Calls `createDesignBrief` once we have style rules + confirmed protected
 * elements. The user can edit the returned markdown in a textarea; the
 * Streamdown preview renders the live edit so they can see exactly what gets
 * fed into the prompt. We do not re-mint the brief on every keystroke — only
 * an explicit re-generate, so the user's edits aren't blown away.
 */
export function BriefStep(props: {
	taskTitle: string;
	protectedElements: BoundingBox[];
	brief: string;
	prompt: string;
	onBriefChange: (brief: string) => void;
	onPromptChange: (prompt: string) => void;
	onNext: () => void;
}) {
	const [styleRules, setStyleRules] = useState(
		"Scandinavian renovation style with warm neutral palette.",
	);
	const [generating, setGenerating] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const cancelledRef = useRef(false);

	useEffect(() => {
		cancelledRef.current = false;
		return () => {
			cancelledRef.current = true;
		};
	}, []);

	async function generateBrief() {
		setError(null);
		setGenerating(true);
		try {
			const headers = await getAuthHeaders();
			const result = await createDesignBrief({
				data: {
					taskTitle: props.taskTitle,
					styleRules: styleRules.slice(0, STYLE_RULES_MAX),
					protectedElements: props.protectedElements,
				},
				headers,
			});
			if (cancelledRef.current) return;
			props.onBriefChange(result.markdown);
			props.onPromptChange(result.prompt);
		} catch (caught) {
			if (cancelledRef.current) return;
			if (caught instanceof Error && caught.message === UNAUTHENTICATED_ERROR) {
				window.location.assign("/auth");
				return;
			}
			setError(
				caught instanceof Error ? caught.message : "Failed to generate brief",
			);
		} finally {
			if (!cancelledRef.current) setGenerating(false);
		}
	}

	const briefValue =
		props.brief ||
		`# ${props.taskTitle}\n\nPreserve ${props.protectedElements.length} confirmed fixed element${
			props.protectedElements.length === 1 ? "" : "s"
		}.\n\nApply the configured style rules.`;
	// Streamdown parses + sanitises markdown on every render, so keystrokes in
	// the textarea would otherwise re-walk the full document each character.
	// `useDeferredValue` lets React stream the textarea update first and defer
	// the preview render, which keeps typing fluid even on large briefs.
	const deferredBrief = useDeferredValue(briefValue);

	return (
		<div className="guided-step" aria-busy={generating}>
			<header className="guided-step-header">
				<h2>3. Review the design brief</h2>
				<p>
					Edit the brief to capture the renovation you want. The preview shows
					exactly what the AI provider will see.
				</p>
			</header>

			<label htmlFor="brief-style-rules" className="guided-field">
				Style rules
				<textarea
					id="brief-style-rules"
					value={styleRules}
					onChange={(event) => setStyleRules(event.target.value)}
					maxLength={STYLE_RULES_MAX}
					rows={3}
				/>
			</label>

			<div className="guided-actions">
				<button
					type="button"
					onClick={generateBrief}
					disabled={generating || styleRules.trim().length === 0}
				>
					{generating
						? "Generating…"
						: props.brief
							? "Re-generate brief"
							: "Generate brief"}
				</button>
				{error ? <p role="alert">{error}</p> : null}
			</div>

			<div className="brief-grid">
				<label htmlFor="brief-markdown" className="guided-field">
					<span>Brief markdown</span>
					<textarea
						id="brief-markdown"
						value={briefValue}
						onChange={(event) =>
							props.onBriefChange(event.target.value.slice(0, BRIEF_MAX))
						}
						maxLength={BRIEF_MAX}
						rows={14}
					/>
				</label>
				<section className="brief-preview" aria-label="Brief preview">
					<Streamdown>{deferredBrief}</Streamdown>
				</section>
			</div>

			<div className="guided-actions">
				<button
					type="button"
					onClick={props.onNext}
					disabled={briefValue.trim().length === 0}
				>
					Continue to generation
				</button>
			</div>
		</div>
	);
}
