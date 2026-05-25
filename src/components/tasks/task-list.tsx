import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { getAuthHeaders } from "../../lib/server-client/auth-headers";
import { createTask, listProjectTasks } from "../../server/tasks";

type TaskRow = {
	id: string;
	title: string;
	category: string;
	status: "suggested" | "active" | "archived";
	notes: string | null;
	created_at: string;
};

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

	const refresh = useCallback(async () => {
		setLoadError(null);
		try {
			const headers = await getAuthHeaders();
			const rows = (await listProjectTasks({
				data: { projectId: props.projectId },
				headers,
			})) as TaskRow[];
			setTasks(rows);
		} catch (error) {
			setLoadError(error instanceof Error ? error.message : "Failed to load");
			setTasks([]);
		}
	}, [props.projectId]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

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
			setTitle("");
			setCategory("");
			setNotes("");
			await refresh();
		} catch (error) {
			setCreateError(error instanceof Error ? error.message : "Failed to save");
		} finally {
			setSubmitting(false);
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

			<form className="workspace-form" onSubmit={handleCreate}>
				<h2>New task</h2>
				<label>
					Title
					<input
						value={title}
						onChange={(event) => setTitle(event.target.value)}
						placeholder="2nd floor — ceiling"
						required
						maxLength={200}
					/>
				</label>
				<label>
					Category
					<input
						value={category}
						onChange={(event) => setCategory(event.target.value)}
						placeholder="ceiling, facade, kitchen…"
						required
						maxLength={200}
					/>
				</label>
				<label>
					Notes
					<textarea
						value={notes}
						onChange={(event) => setNotes(event.target.value)}
						placeholder="Optional context for the AI provider."
						maxLength={4000}
					/>
				</label>
				<button type="submit" disabled={submitting || !formValid}>
					{submitting ? "Saving…" : "Create task"}
				</button>
				{createError ? <p role="alert">{createError}</p> : null}
			</form>

			{tasks === null && loadError === null ? (
				<p className="workspace-status">Loading tasks…</p>
			) : null}
			{loadError ? <p role="alert">{loadError}</p> : null}

			{tasks && tasks.length === 0 && !loadError ? (
				<p className="workspace-status">
					No tasks yet. Create one above to start a renovation concept.
				</p>
			) : null}

			{tasks && tasks.length > 0 ? (
				<div className="card-grid">
					{tasks.map((task) => (
						<Link
							className="workspace-card"
							key={task.id}
							to="/projects/$projectId/tasks/$taskId"
							params={{ projectId: props.projectId, taskId: task.id }}
						>
							<h2>{task.title}</h2>
							<p className="workspace-card-meta">
								<span className="badge">{task.category}</span>
								<span className="badge badge-status">{task.status}</span>
							</p>
							{task.notes ? <p>{task.notes}</p> : null}
						</Link>
					))}
				</div>
			) : null}
		</section>
	);
}
