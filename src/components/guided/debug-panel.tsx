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
		<details className="debug-panel">
			<summary>
				Debug — {props.label} AI request/response ({props.debug.model},{" "}
				{props.debug.durationMs}ms)
			</summary>
			<div className="debug-panel-body">
				<h4>Prompt</h4>
				<pre>{props.debug.prompt}</pre>
				<h4>Raw response</h4>
				<pre>{props.debug.rawResponse}</pre>
			</div>
		</details>
	);
}
