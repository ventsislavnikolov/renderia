import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	getAuthHeaders,
	UNAUTHENTICATED_ERROR,
} from "../../lib/server-client/auth-headers";
import type { Tables } from "../../lib/types/database";
import { createProject, listProjects } from "../../server/projects";

/**
 * Row shape returned by `listProjects`. Re-uses the canonical row type from
 * `src/lib/types/database.ts` so we never drift from the database schema.
 */
type ProjectRow = Tables<"projects">;

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
	const [createdAnnouncement, setCreatedAnnouncement] = useState<string | null>(
		null,
	);
	const cancelledRef = useRef(false);

	const refresh = useCallback(async () => {
		if (cancelledRef.current) return;
		setLoadError(null);
		try {
			const headers = await getAuthHeaders();
			const rows: ProjectRow[] = await listProjects({ headers });
			if (cancelledRef.current) return;
			setProjects(rows);
		} catch (error) {
			if (cancelledRef.current) return;
			if (error instanceof Error && error.message === UNAUTHENTICATED_ERROR) {
				window.location.assign("/auth");
				return;
			}
			setLoadError(error instanceof Error ? error.message : "Failed to load");
			setProjects([]);
		}
	}, []);

	useEffect(() => {
		cancelledRef.current = false;
		void refresh();
		return () => {
			cancelledRef.current = true;
		};
	}, [refresh]);

	// Clear the "created" announcement after a few seconds so it isn't sticky
	// for sighted users; SR users have already heard it via the live region.
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
			await createProject({
				data: {
					name: name.trim(),
					description: description.trim() || undefined,
				},
				headers,
			});
			if (cancelledRef.current) return;
			setName("");
			setDescription("");
			await refresh();
			if (cancelledRef.current) return;
			setCreatedAnnouncement("Project created.");
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

	return (
		<section className="workspace-section">
			<header className="workspace-section-header">
				<h1>Projects</h1>
				<p>Group renovation tasks by house, floor, or external concept.</p>
			</header>

			<form
				className="workspace-form"
				onSubmit={handleCreate}
				aria-busy={submitting}
			>
				<h2>New project</h2>
				<label htmlFor="new-project-name">
					Name
					<input
						id="new-project-name"
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder="City house"
						required
						maxLength={200}
						aria-describedby={
							createError ? "new-project-name-error" : undefined
						}
						aria-invalid={createError ? true : undefined}
					/>
				</label>
				<label htmlFor="new-project-description">
					Description
					<textarea
						id="new-project-description"
						value={description}
						onChange={(event) => setDescription(event.target.value)}
						placeholder="Optional notes about the property."
						maxLength={2000}
					/>
				</label>
				<button type="submit" disabled={submitting || name.trim().length === 0}>
					{submitting ? "Saving…" : "Create project"}
				</button>
				{createError ? (
					<p id="new-project-name-error" role="alert">
						{createError}
					</p>
				) : null}
				<output aria-live="polite" className="sr-only">
					{createdAnnouncement ?? ""}
				</output>
			</form>

			{projects === null && loadError === null ? (
				<output className="workspace-status">Loading projects…</output>
			) : null}
			{loadError ? <p role="alert">{loadError}</p> : null}

			{projects && projects.length === 0 && !loadError ? (
				<p className="workspace-status">
					No projects yet. Create one above to get started.
				</p>
			) : null}

			{projects && projects.length > 0 ? (
				<ul className="card-grid">
					{projects.map((project) => (
						<li key={project.id}>
							<Link
								className="workspace-card"
								to="/projects/$projectId"
								params={{ projectId: project.id }}
							>
								<h3>{project.name}</h3>
								{project.description ? <p>{project.description}</p> : null}
							</Link>
						</li>
					))}
				</ul>
			) : null}
		</section>
	);
}
