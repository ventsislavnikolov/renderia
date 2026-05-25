import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { getAuthHeaders } from "../../lib/server-client/auth-headers";
import { createProject, listProjects } from "../../server/projects";

/**
 * Row shape returned by `listProjects`. We only render the columns we need
 * and rely on `src/lib/types/database.ts` for the canonical shape.
 */
type ProjectRow = {
	id: string;
	name: string;
	description: string | null;
	created_at: string;
};

/**
 * Projects index: fetches the signed-in user's projects via the server fn
 * and renders a create form. Loading + error are exposed in the UI so a
 * blank dashboard isn't ambiguous.
 *
 * Task 8 will not modify this component — it only adds new components for
 * the guided flow.
 */
export function ProjectList() {
	const [projects, setProjects] = useState<ProjectRow[] | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [createError, setCreateError] = useState<string | null>(null);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [submitting, setSubmitting] = useState(false);

	const refresh = useCallback(async () => {
		setLoadError(null);
		try {
			const headers = await getAuthHeaders();
			const rows = (await listProjects({ headers })) as ProjectRow[];
			setProjects(rows);
		} catch (error) {
			setLoadError(error instanceof Error ? error.message : "Failed to load");
			setProjects([]);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	async function handleCreate(event: React.FormEvent) {
		event.preventDefault();
		setCreateError(null);
		setSubmitting(true);
		try {
			const headers = await getAuthHeaders();
			await createProject({
				data: {
					name: name.trim(),
					description: description.trim() || undefined,
				},
				headers,
			});
			setName("");
			setDescription("");
			await refresh();
		} catch (error) {
			setCreateError(error instanceof Error ? error.message : "Failed to save");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<section className="workspace-section">
			<header className="workspace-section-header">
				<h1>Projects</h1>
				<p>Group renovation tasks by house, floor, or external concept.</p>
			</header>

			<form className="workspace-form" onSubmit={handleCreate}>
				<h2>New project</h2>
				<label>
					Name
					<input
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder="City house"
						required
						maxLength={200}
					/>
				</label>
				<label>
					Description
					<textarea
						value={description}
						onChange={(event) => setDescription(event.target.value)}
						placeholder="Optional notes about the property."
						maxLength={2000}
					/>
				</label>
				<button type="submit" disabled={submitting || name.trim().length === 0}>
					{submitting ? "Saving…" : "Create project"}
				</button>
				{createError ? <p role="alert">{createError}</p> : null}
			</form>

			{projects === null && loadError === null ? (
				<p className="workspace-status">Loading projects…</p>
			) : null}
			{loadError ? <p role="alert">{loadError}</p> : null}

			{projects && projects.length === 0 && !loadError ? (
				<p className="workspace-status">
					No projects yet. Create one above to get started.
				</p>
			) : null}

			{projects && projects.length > 0 ? (
				<div className="card-grid">
					{projects.map((project) => (
						<Link
							className="workspace-card"
							key={project.id}
							to="/projects/$projectId"
							params={{ projectId: project.id }}
						>
							<h2>{project.name}</h2>
							{project.description ? <p>{project.description}</p> : null}
						</Link>
					))}
				</div>
			) : null}
		</section>
	);
}
