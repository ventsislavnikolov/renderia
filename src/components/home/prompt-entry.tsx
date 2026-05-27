import { useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_TEXT_MODEL, type ModelSelection } from "@/lib/ai/models";
import {
	getAuthHeaders,
	UNAUTHENTICATED_ERROR,
} from "../../lib/server-client/auth-headers";
import { createProjectFromPrompt } from "../../server/projects";
import { ModelPicker } from "../ui/model-picker";

/**
 * Centered chat-style entry point — modeled on the Codex / Claude home page.
 *
 * The user types a free-form renovation goal and submits. The handler
 * creates a project + task server-side, then routes into the 4-step
 * guided workspace where they upload a photo and run detection.
 */
export function PromptEntry() {
	const navigate = useNavigate();
	const [prompt, setPrompt] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// Model selection is captured here so a future "auto-start detection on
	// task open" wiring can honor it. Today it's purely cosmetic — the
	// detection step has its own picker.
	const [, setModel] = useState<ModelSelection>(DEFAULT_TEXT_MODEL);

	async function handleSubmit(event: React.FormEvent) {
		event.preventDefault();
		const trimmed = prompt.trim();
		if (trimmed.length === 0 || submitting) return;
		setSubmitting(true);
		setError(null);
		try {
			const headers = await getAuthHeaders();
			const { projectId, taskId } = (await createProjectFromPrompt({
				data: { prompt: trimmed },
				headers,
			})) as { projectId: string; taskId: string };
			await navigate({
				to: "/projects/$projectId/tasks/$taskId",
				params: { projectId, taskId },
			});
		} catch (caught) {
			if (caught instanceof Error && caught.message === UNAUTHENTICATED_ERROR) {
				window.location.assign("/auth");
				return;
			}
			setError(
				caught instanceof Error ? caught.message : "Failed to create project"
			);
			setSubmitting(false);
		}
	}

	return (
		<section
			aria-label="Start a new renovation"
			className="flex flex-col items-center justify-center gap-6 py-8 text-center md:min-h-[calc(100vh-6rem)]"
		>
			<h1 className="m-0 max-w-[28ch] font-medium text-[1.625rem] text-foreground leading-tight tracking-tight">
				What should we build in renderia?
			</h1>

			<form
				className="flex w-full max-w-[720px] flex-col gap-3 rounded-xl border border-border bg-popover p-4 shadow-sm transition-[border-color,box-shadow] focus-within:border-foreground/40 focus-within:shadow-md"
				onSubmit={handleSubmit}
			>
				<Textarea
					aria-label="Describe what you want to renovate"
					className="min-h-[96px] resize-y border-none bg-transparent p-1 text-base shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
					disabled={submitting}
					maxLength={2000}
					onChange={(event) => setPrompt(event.target.value)}
					onKeyDown={(event) => {
						// Cmd/Ctrl+Enter submits — single Enter inserts a newline so
						// users can write multi-line prompts comfortably.
						if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
							event.preventDefault();
							void handleSubmit(event as unknown as React.FormEvent);
						}
					}}
					placeholder="Describe what you want to renovate — the attic, the kitchen, a corner…"
					rows={4}
					value={prompt}
				/>
				<div className="flex items-center justify-between gap-3 border-border border-t pt-2">
					<ModelPicker
						capability="entry-prompt"
						kind="text-vision"
						onChange={setModel}
					/>
					<Button
						className="rounded-full px-5 font-semibold"
						disabled={submitting || prompt.trim().length === 0}
						type="submit"
					>
						{submitting ? "Creating…" : "Create"}
						<ArrowRight className="size-4" />
					</Button>
				</div>
			</form>

			{error ? (
				<p className="m-0 max-w-[600px] text-destructive text-sm" role="alert">
					{error}
				</p>
			) : null}

			<p className="m-0 text-ink-subtle text-xs">
				Press{" "}
				<kbd className="inline-block rounded border border-border bg-surface px-1.5 py-0.5 font-medium text-[11px] text-foreground">
					⌘
				</kbd>{" "}
				+{" "}
				<kbd className="inline-block rounded border border-border bg-surface px-1.5 py-0.5 font-medium text-[11px] text-foreground">
					Enter
				</kbd>{" "}
				to submit.
			</p>
		</section>
	);
}
