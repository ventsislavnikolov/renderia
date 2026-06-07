import {
	createFileRoute,
	Link,
	Outlet,
	useChildMatches,
} from "@tanstack/react-router";
import { Breadcrumbs } from "../components/layout/app-shell";
import { TaskList } from "../components/tasks/task-list";
import { useWorkspace } from "../lib/workspace-context";

/**
 * `/projects/:projectId` — project detail / task workspace.
 *
 * Auth lives in the `_app` layout. The friendly project name comes from the
 * shared workspace context (already loaded by the shell), so the breadcrumb
 * resolves instantly without an extra fetch. `TaskList` owns its create form
 * and reads rooms from the same context cache.
 */
export const Route = createFileRoute("/_app/projects/$projectId")({
	ssr: false,
	component: ProjectRoute,
});

function ProjectRoute() {
	const { projectId } = Route.useParams();
	const { projects } = useWorkspace();
	// File-routing nests `/projects/$projectId/tasks/$taskId` underneath this
	// route. Without delegating to the `<Outlet />` we'd render the task list
	// over the top of the guided task workspace. When any child match exists
	// we hand off rendering to the child route entirely.
	const hasChildRoute = useChildMatches().length > 0;

	const project = projects?.find((row) => row.id === projectId) ?? null;

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
		<>
			<Breadcrumbs>{breadcrumbs}</Breadcrumbs>
			<TaskList projectId={projectId} />
		</>
	);
}
