import { useDeferredValue, useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { BoundingBox, ProviderDebug } from "../../lib/ai/types";
import {
	getAuthHeaders,
	UNAUTHENTICATED_ERROR,
} from "../../lib/server-client/auth-headers";
import { createDesignBrief, saveDesignBrief } from "../../server/generation";
import { DebugPanel } from "./debug-panel";

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
	taskId: string;
	taskTitle: string;
	protectedElements: BoundingBox[];
	brief: string;
	prompt: string;
	styleRules: string;
	onBriefChange: (brief: string) => void;
	onBriefIdChange: (briefId: string | null) => void;
	onPromptChange: (prompt: string) => void;
	onStyleRulesChange: (styleRules: string) => void;
	onNext: () => void;
}) {
	const styleRules = props.styleRules;
	const [generating, setGenerating] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [debug, setDebug] = useState<ProviderDebug | null>(null);
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
			const response = (await createDesignBrief({
				data: {
					taskId: props.taskId,
					taskTitle: props.taskTitle,
					styleRules: styleRules.slice(0, STYLE_RULES_MAX),
					protectedElements: props.protectedElements,
				},
				headers,
			})) as
				| { id?: string; markdown: string; prompt: string; version?: number }
				| {
						data: {
							id?: string;
							markdown: string;
							prompt: string;
							version?: number;
						};
						debug?: ProviderDebug;
				  };
			if (cancelledRef.current) return;
			// Accept both the legacy bare shape and the new `{ data, debug? }`
			// wrapper so the same UI works against either server fn revision.
			const payload =
				"data" in response && response.data
					? response.data
					: (response as {
							id?: string;
							markdown: string;
							prompt: string;
							version?: number;
						});
			const responseDebug: ProviderDebug | undefined =
				"debug" in response ? response.debug : undefined;
			props.onBriefChange(payload.markdown);
			props.onBriefIdChange(payload.id ?? null);
			props.onPromptChange(payload.prompt);
			setDebug(responseDebug ?? null);
		} catch (caught) {
			if (cancelledRef.current) return;
			if (caught instanceof Error && caught.message === UNAUTHENTICATED_ERROR) {
				window.location.assign("/sign-in");
				return;
			}
			setError(
				caught instanceof Error ? caught.message : "Failed to generate brief"
			);
		} finally {
			if (!cancelledRef.current) setGenerating(false);
		}
	}

	async function continueToGeneration() {
		const markdown = briefValue.trim();
		if (markdown.length === 0) return;

		setError(null);
		setSaving(true);
		try {
			const headers = await getAuthHeaders();
			const payload = (await saveDesignBrief({
				data: {
					taskId: props.taskId,
					taskTitle: props.taskTitle,
					styleRules: styleRules.slice(0, STYLE_RULES_MAX),
					markdown: markdown.slice(0, BRIEF_MAX),
					protectedElements: props.protectedElements,
				},
				headers,
			})) as {
				id?: string;
				markdown: string;
				prompt: string;
				version?: number;
			};
			if (cancelledRef.current) return;
			props.onBriefChange(payload.markdown);
			props.onBriefIdChange(payload.id ?? null);
			props.onPromptChange(payload.prompt);
			props.onNext();
		} catch (caught) {
			if (cancelledRef.current) return;
			if (caught instanceof Error && caught.message === UNAUTHENTICATED_ERROR) {
				window.location.assign("/sign-in");
				return;
			}
			setError(
				caught instanceof Error ? caught.message : "Failed to save brief"
			);
		} finally {
			if (!cancelledRef.current) setSaving(false);
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
		<div
			aria-busy={generating}
			className="grid gap-6 border border-border bg-surface p-10 max-md:p-6"
		>
			<header className="grid gap-2">
				<h2 className="m-0 font-display font-medium text-2xl text-foreground tracking-tight">
					3. Review the design brief
				</h2>
				<p className="m-0 max-w-[68ch] font-body text-[0.9375rem] text-ink-muted leading-relaxed">
					Edit the brief to capture the renovation you want. The preview shows
					exactly what the AI provider will see.
				</p>
			</header>

			<label
				className="grid max-w-3xl gap-2 font-body font-medium text-foreground text-sm"
				htmlFor="brief-style-rules"
			>
				<span>Style rules</span>
				<Textarea
					className="min-h-24 resize-y bg-background font-body font-normal leading-relaxed"
					id="brief-style-rules"
					maxLength={STYLE_RULES_MAX}
					onChange={(event) => props.onStyleRulesChange(event.target.value)}
					rows={3}
					value={styleRules}
				/>
			</label>

			<div className="flex flex-wrap items-center gap-3">
				<Button
					disabled={generating || saving || styleRules.trim().length === 0}
					onClick={generateBrief}
					type="button"
				>
					{generating
						? "Generating…"
						: props.brief
							? "Re-generate brief"
							: "Generate brief"}
				</Button>
				{error ? (
					<p className="m-0 text-sm text-warning" role="alert">
						{error}
					</p>
				) : null}
			</div>

			<div className="grid grid-cols-[minmax(0,1fr)_minmax(20rem,0.75fr)] gap-6 max-lg:grid-cols-1">
				<label
					className="grid min-w-0 gap-2 font-body font-medium text-foreground text-sm"
					htmlFor="brief-markdown"
				>
					<span>Brief markdown</span>
					<Textarea
						className="min-h-[22rem] resize-y bg-background font-mono font-normal text-sm leading-relaxed"
						id="brief-markdown"
						maxLength={BRIEF_MAX}
						onChange={(event) => {
							props.onBriefChange(event.target.value.slice(0, BRIEF_MAX));
							props.onBriefIdChange(null);
						}}
						rows={14}
						value={briefValue}
					/>
				</label>
				<section
					aria-label="Brief preview"
					className="prose prose-neutral min-w-0 max-w-none border border-border bg-background p-5 prose-headings:font-display prose-headings:font-medium prose-headings:text-foreground prose-p:text-foreground prose-strong:text-foreground text-foreground"
				>
					<Streamdown>{deferredBrief}</Streamdown>
				</section>
			</div>

			<div className="flex flex-wrap items-center gap-3">
				<Button
					disabled={saving || generating || briefValue.trim().length === 0}
					onClick={continueToGeneration}
					type="button"
				>
					{saving ? "Saving…" : "Continue to generation"}
				</Button>
			</div>

			<DebugPanel debug={debug} label="Design brief" />
		</div>
	);
}
