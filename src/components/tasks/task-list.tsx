import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
	getAuthHeaders,
	UNAUTHENTICATED_ERROR,
} from "../../lib/server-client/auth-headers";
import type { Tables } from "../../lib/types/database";
import { createTask, listProjectTasks } from "../../server/tasks";

type TaskRow = Tables<"renovation_tasks">;

/**
 * Lists renovation tasks for a project plus a quick-create form. The route
 * owns the `projectId` (from URL params) and passes it down so the same
 * component can be reused inside the project detail route and any future
 * "all tasks" overview.
 */
export function TaskList(props: { projectId: string }) {
	const [tasks, setTasks] = useState<TaskRow[] | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [createError, setCreateError] = useState<string | null>(null);
	const [title, setTitle] = useState("");
	const [category, setCategory] = useState("");
	const [notes, setNotes] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [createdAnnouncement, setCreatedAnnouncement] = useState<string | null>(
		null
	);
	const cancelledRef = useRef(false);

	const refresh = useCallback(async () => {
		if (cancelledRef.current) return;
		setLoadError(null);
		try {
			const headers = await getAuthHeaders();
			const rows: TaskRow[] = await listProjectTasks({
				data: { projectId: props.projectId },
				headers,
			});
			if (cancelledRef.current) return;
			setTasks(rows);
		} catch (error) {
			if (cancelledRef.current) return;
			if (error instanceof Error && error.message === UNAUTHENTICATED_ERROR) {
				window.location.assign("/auth");
				return;
			}
			setLoadError(error instanceof Error ? error.message : "Failed to load");
			setTasks([]);
		}
	}, [props.projectId]);

	useEffect(() => {
		cancelledRef.current = false;
		void refresh();
		return () => {
			cancelledRef.current = true;
		};
	}, [refresh]);

	useEffect(() => {
		if (!createdAnnouncement) return;
		const timer = window.setTimeout(() => setCreatedAnnouncement(null), 3000);
		return () => window.clearTimeout(timer);
	}, [createdAnnouncement]);

	async function handleCreate(event: React.FormEvent) {
		event.preventDefault();
		setCreateError(null);
		setSubmitting(true);
		try {
			const headers = await getAuthHeaders();
			await createTask({
				data: {
					projectId: props.projectId,
					title: title.trim(),
					category: category.trim(),
					notes: notes.trim() || undefined,
				},
				headers,
			});
			if (cancelledRef.current) return;
			setTitle("");
			setCategory("");
			setNotes("");
			await refresh();
			if (cancelledRef.current) return;
			setCreatedAnnouncement("Task created.");
		} catch (error) {
			if (cancelledRef.current) return;
			if (error instanceof Error && error.message === UNAUTHENTICATED_ERROR) {
				window.location.assign("/auth");
				return;
			}
			setCreateError(error instanceof Error ? error.message : "Failed to save");
		} finally {
			if (!cancelledRef.current) setSubmitting(false);
		}
	}

	const formValid = title.trim().length > 0 && category.trim().length > 0;

	return (
		<section className="grid gap-8">
			<header className="grid gap-2">
				<h1 className="m-0 font-display font-medium text-4xl text-foreground tracking-tight">
					Renovation tasks
				</h1>
				<p className="m-0 max-w-[60ch] font-body text-base text-ink-muted">
					Each task captures one area of the house. Open a task to step through
					the guided renovation flow.
				</p>
			</header>

			<form
				aria-busy={submitting}
				className="grid gap-4 border border-border bg-surface p-8"
				onSubmit={handleCreate}
			>
				<h2 className="m-0 font-display font-medium text-foreground text-xl tracking-tight">
					New task
				</h2>
				<label
					className="grid gap-2 font-body font-semibold text-[0.6875rem] text-ink-subtle uppercase tracking-[0.08em]"
					htmlFor="new-task-title"
				>
					Title
					<Input
						aria-describedby={createError ? "new-task-error" : undefined}
						aria-invalid={createError ? true : undefined}
						className="text-base normal-case tracking-normal"
						id="new-task-title"
						maxLength={200}
						onChange={(event) => setTitle(event.target.value)}
						placeholder="2nd floor — ceiling"
						required
						value={title}
					/>
				</label>
				<label
					className="grid gap-2 font-body font-semibold text-[0.6875rem] text-ink-subtle uppercase tracking-[0.08em]"
					htmlFor="new-task-category"
				>
					Category
					<Input
						className="text-base normal-case tracking-normal"
						id="new-task-category"
						maxLength={200}
						onChange={(event) => setCategory(event.target.value)}
						placeholder="ceiling, facade, kitchen…"
						required
						value={category}
					/>
				</label>
				<label
					className="grid gap-2 font-body font-semibold text-[0.6875rem] text-ink-subtle uppercase tracking-[0.08em]"
					htmlFor="new-task-notes"
				>
					Notes
					<Textarea
						className="text-base normal-case tracking-normal"
						id="new-task-notes"
						maxLength={4000}
						onChange={(event) => setNotes(event.target.value)}
						placeholder="Optional context for the AI provider."
						value={notes}
					/>
				</label>
				<Button
					className="justify-self-start"
					disabled={submitting || !formValid}
					type="submit"
				>
					{submitting ? "Saving…" : "Create task"}
				</Button>
				{createError ? (
					<p
						className="m-0 font-medium text-[0.875rem] text-destructive"
						id="new-task-error"
						role="alert"
					>
						{createError}
					</p>
				) : null}
				<output aria-live="polite" className="sr-only">
					{createdAnnouncement ?? ""}
				</output>
			</form>

			{tasks === null && loadError === null ? (
				<output className="block text-[0.9375rem] text-ink-muted italic">
					Loading tasks…
				</output>
			) : null}
			{loadError ? (
				<p
					className="m-0 font-medium text-[0.9375rem] text-warning"
					role="alert"
				>
					{loadError}
				</p>
			) : null}

			{tasks && tasks.length === 0 && !loadError ? (
				<p className="m-0 text-[0.9375rem] text-ink-muted italic">
					No tasks yet. Create one above to start a renovation concept.
				</p>
			) : null}

			{tasks && tasks.length > 0 ? (
				<ul className="m-0 grid list-none gap-4 p-0 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
					{tasks.map((task) => (
						<li key={task.id}>
							<Link
								className="block border border-border bg-surface p-6 no-underline transition-[border-color,box-shadow] hover:border-foreground hover:shadow-sm"
								params={{ projectId: props.projectId, taskId: task.id }}
								to="/projects/$projectId/tasks/$taskId"
							>
								<h3 className="m-0 mb-3 font-display font-medium text-foreground text-xl tracking-tight">
									{task.title}
								</h3>
								<p className="m-0 mb-3 flex flex-wrap gap-2">
									<Badge variant="secondary">{task.category}</Badge>
									<Badge variant="outline">{task.status}</Badge>
								</p>
								{task.notes ? (
									<p className="m-0 text-[0.875rem] text-ink-muted leading-relaxed">
										{task.notes}
									</p>
								) : null}
							</Link>
						</li>
					))}
				</ul>
			) : null}
		</section>
	);
}
