import type { ProviderDebug } from "../../lib/ai/types";

/**
 * Dev-only inspector for the most recent AI provider call.
 *
 * Mounts inside a `<details>` so it never steals layout unless the developer
 * opens it. Hidden entirely in production builds via `import.meta.env.MODE`
 * — the server fn already strips the debug payload in prod, but gating the
 * UI as well keeps the markup out of the production bundle.
 */
export function DebugPanel(props: {
	debug: ProviderDebug | null | undefined;
	label: string;
}) {
	if (import.meta.env.MODE === "production") return null;
	if (!props.debug) return null;
	return (
		<details className="rounded-md border border-border bg-foreground/95 p-4 font-mono text-ink-subtle text-xs">
			<summary className="cursor-pointer select-none text-gold">
				Debug — {props.label} AI request/response ({props.debug.model},{" "}
				{props.debug.durationMs}ms)
			</summary>
			<div className="mt-3 grid gap-3">
				<h4 className="m-0 font-display font-medium text-[0.75rem] text-gold uppercase tracking-wider">
					Prompt
				</h4>
				<pre className="m-0 overflow-x-auto whitespace-pre-wrap font-mono text-[0.75rem] text-popover">
					{props.debug.prompt}
				</pre>
				<h4 className="m-0 font-display font-medium text-[0.75rem] text-gold uppercase tracking-wider">
					Raw response
				</h4>
				<pre className="m-0 overflow-x-auto whitespace-pre-wrap font-mono text-[0.75rem] text-popover">
					{props.debug.rawResponse}
				</pre>
			</div>
		</details>
	);
}
