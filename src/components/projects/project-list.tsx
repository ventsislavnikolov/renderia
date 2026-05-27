import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
 */
export function ProjectList() {
	const [projects, setProjects] = useState<ProjectRow[] | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [createError, setCreateError] = useState<string | null>(null);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
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
		<section className="grid gap-8">
			<header className="grid gap-2">
				<h1 className="m-0 font-display font-medium text-4xl text-foreground tracking-tight">
					Projects
				</h1>
				<p className="m-0 max-w-[60ch] font-body text-base text-ink-muted">
					Group renovation tasks by house, floor, or external concept.
				</p>
			</header>

			<form
				aria-busy={submitting}
				className="grid gap-4 border border-border bg-surface p-8"
				onSubmit={handleCreate}
			>
				<h2 className="m-0 font-display font-medium text-foreground text-xl tracking-tight">
					New project
				</h2>
				<label
					className="grid gap-2 font-body font-semibold text-[0.6875rem] text-ink-subtle uppercase tracking-[0.08em]"
					htmlFor="new-project-name"
				>
					Name
					<Input
						aria-describedby={
							createError ? "new-project-name-error" : undefined
						}
						aria-invalid={createError ? true : undefined}
						className="text-base normal-case tracking-normal"
						id="new-project-name"
						maxLength={200}
						onChange={(event) => setName(event.target.value)}
						placeholder="City house"
						required
						value={name}
					/>
				</label>
				<label
					className="grid gap-2 font-body font-semibold text-[0.6875rem] text-ink-subtle uppercase tracking-[0.08em]"
					htmlFor="new-project-description"
				>
					Description
					<Textarea
						className="text-base normal-case tracking-normal"
						id="new-project-description"
						maxLength={2000}
						onChange={(event) => setDescription(event.target.value)}
						placeholder="Optional notes about the property."
						value={description}
					/>
				</label>
				<Button
					className="justify-self-start"
					disabled={submitting || name.trim().length === 0}
					type="submit"
				>
					{submitting ? "Saving…" : "Create project"}
				</Button>
				{createError ? (
					<p
						className="m-0 font-medium text-[0.875rem] text-destructive"
						id="new-project-name-error"
						role="alert"
					>
						{createError}
					</p>
				) : null}
				<output aria-live="polite" className="sr-only">
					{createdAnnouncement ?? ""}
				</output>
			</form>

			{projects === null && loadError === null ? (
				<output className="block text-[0.9375rem] text-ink-muted italic">
					Loading projects…
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

			{projects && projects.length === 0 && !loadError ? (
				<p className="m-0 text-[0.9375rem] text-ink-muted italic">
					No projects yet. Create one above to get started.
				</p>
			) : null}

			{projects && projects.length > 0 ? (
				<ul className="m-0 grid list-none gap-4 p-0 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
					{projects.map((project) => (
						<li key={project.id}>
							<Link
								className="block border border-border bg-surface p-6 no-underline transition-[border-color,box-shadow] hover:border-foreground hover:shadow-sm"
								params={{ projectId: project.id }}
								to="/projects/$projectId"
							>
								<h3 className="m-0 mb-2 font-display font-medium text-foreground text-xl tracking-tight">
									{project.name}
								</h3>
								{project.description ? (
									<p className="m-0 text-[0.875rem] text-ink-muted leading-relaxed">
										{project.description}
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
