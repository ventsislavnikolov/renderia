import {
	createFileRoute,
	Link,
	Outlet,
	redirect,
	useChildMatches,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "../components/layout/app-shell";
import { TaskList } from "../components/tasks/task-list";
import {
	getAuthHeaders,
	UNAUTHENTICATED_ERROR,
} from "../lib/server-client/auth-headers";
import { supabaseBrowser } from "../lib/supabase/browser";
import type { Tables } from "../lib/types/database";
import { getProject } from "../server/projects";

type ProjectRow = Tables<"projects">;

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
	// File-routing nests `/projects/$projectId/tasks/$taskId` underneath this
	// route. Without delegating to the `<Outlet />` we'd render the task list
	// over the top of the guided task workspace. When any child match exists
	// we hand off rendering to the child route entirely.
	const hasChildRoute = useChildMatches().length > 0;

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const headers = await getAuthHeaders();
				const row: ProjectRow = await getProject({
					data: { projectId },
					headers,
				});
				if (!cancelled) setProject(row);
			} catch (caught) {
				if (cancelled) return;
				if (
					caught instanceof Error &&
					caught.message === UNAUTHENTICATED_ERROR
				) {
					window.location.assign("/auth");
					return;
				}
				setError(
					caught instanceof Error ? caught.message : "Failed to load project",
				);
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
			<span aria-current="page">{project?.name ?? "…"}</span>
		</>
	);

	if (hasChildRoute) {
		return <Outlet />;
	}

	return (
		<AppShell breadcrumbs={breadcrumbs}>
			{error ? <p role="alert">{error}</p> : null}
			<TaskList projectId={projectId} />
		</AppShell>
	);
}
