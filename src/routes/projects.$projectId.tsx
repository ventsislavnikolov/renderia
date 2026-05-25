import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "../components/layout/app-shell";
import { TaskList } from "../components/tasks/task-list";
import { getAuthHeaders } from "../lib/server-client/auth-headers";
import { supabaseBrowser } from "../lib/supabase/browser";
import { getProject } from "../server/projects";

type ProjectRow = {
	id: string;
	name: string;
	description: string | null;
};

/**
 * `/projects/:projectId` — project detail / task workspace.
 *
 * Renders the task list (and create form) for one project. The route is the
 * data boundary: it fetches the project row to show a friendly name in the
 * breadcrumb and lets `TaskList` own its own data lifecycle so the create
 * form can refresh in place.
 */
export const Route = createFileRoute("/projects/$projectId")({
	ssr: false,
	beforeLoad: async () => {
		const {
			data: { session },
		} = await supabaseBrowser.auth.getSession();
		if (!session) {
			throw redirect({ to: "/auth" });
		}
	},
	component: ProjectRoute,
});

function ProjectRoute() {
	const { projectId } = Route.useParams();
	const [project, setProject] = useState<ProjectRow | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const headers = await getAuthHeaders();
				const row = (await getProject({
					data: { projectId },
					headers,
				})) as ProjectRow;
				if (!cancelled) setProject(row);
			} catch (caught) {
				if (!cancelled) {
					setError(
						caught instanceof Error ? caught.message : "Failed to load project",
					);
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [projectId]);

	const breadcrumbs = (
		<>
			<Link to="/projects">Projects</Link>
			<span aria-hidden="true"> / </span>
			<span>{project?.name ?? "…"}</span>
		</>
	);

	return (
		<AppShell breadcrumbs={breadcrumbs}>
			{error ? <p role="alert">{error}</p> : null}
			<TaskList projectId={projectId} />
		</AppShell>
	);
}
