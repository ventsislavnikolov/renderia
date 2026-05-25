import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	getAuthHeaders,
	UNAUTHENTICATED_ERROR,
} from "../../lib/server-client/auth-headers";
import type { Tables } from "../../lib/types/database";
import { createTask, listProjectTasks } from "../../server/tasks";

type TaskRow = Tables<"renovation_tasks">;

/**
 * Lists renovation tasks for a project plus a quick-create form.
 *
 * The route owns the `projectId` (from URL params) and passes it down so
 * the same component can be reused inside the project detail route and
 * any future "all tasks" overview.
 *
 * Photo upload, protected-element overlay, brief, and generation are
 * intentionally not rendered here — those live inside the guided task
 * workspace route added in Task 8.
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
		null,
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
		<section className="workspace-section">
			<header className="workspace-section-header">
				<h1>Renovation tasks</h1>
				<p>
					Each task captures one area of the house. Open a task to step through
					the guided renovation flow.
				</p>
			</header>

			<form
				className="workspace-form"
				onSubmit={handleCreate}
				aria-busy={submitting}
			>
				<h2>New task</h2>
				<label htmlFor="new-task-title">
					Title
					<input
						id="new-task-title"
						value={title}
						onChange={(event) => setTitle(event.target.value)}
						placeholder="2nd floor — ceiling"
						required
						maxLength={200}
						aria-describedby={createError ? "new-task-error" : undefined}
						aria-invalid={createError ? true : undefined}
					/>
				</label>
				<label htmlFor="new-task-category">
					Category
					<input
						id="new-task-category"
						value={category}
						onChange={(event) => setCategory(event.target.value)}
						placeholder="ceiling, facade, kitchen…"
						required
						maxLength={200}
					/>
				</label>
				<label htmlFor="new-task-notes">
					Notes
					<textarea
						id="new-task-notes"
						value={notes}
						onChange={(event) => setNotes(event.target.value)}
						placeholder="Optional context for the AI provider."
						maxLength={4000}
					/>
				</label>
				<button type="submit" disabled={submitting || !formValid}>
					{submitting ? "Saving…" : "Create task"}
				</button>
				{createError ? (
					<p id="new-task-error" role="alert">
						{createError}
					</p>
				) : null}
				<output aria-live="polite" className="sr-only">
					{createdAnnouncement ?? ""}
				</output>
			</form>

			{tasks === null && loadError === null ? (
				<output className="workspace-status">Loading tasks…</output>
			) : null}
			{loadError ? <p role="alert">{loadError}</p> : null}

			{tasks && tasks.length === 0 && !loadError ? (
				<p className="workspace-status">
					No tasks yet. Create one above to start a renovation concept.
				</p>
			) : null}

			{tasks && tasks.length > 0 ? (
				<ul className="card-grid">
					{tasks.map((task) => (
						<li key={task.id}>
							<Link
								className="workspace-card"
								to="/projects/$projectId/tasks/$taskId"
								params={{ projectId: props.projectId, taskId: task.id }}
							>
								<h3>{task.title}</h3>
								<p className="workspace-card-meta">
									<span className="badge">{task.category}</span>
									<span className="badge badge-status">{task.status}</span>
								</p>
								{task.notes ? <p>{task.notes}</p> : null}
							</Link>
						</li>
					))}
				</ul>
			) : null}
		</section>
	);
}
