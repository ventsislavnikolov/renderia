import {
	createFileRoute,
	Link,
	Outlet,
	useChildMatches,
	useNavigate,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Breadcrumbs } from "../components/layout/app-shell";
import { ProjectActionsMenu } from "../components/projects/project-actions-menu";
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
	const navigate = useNavigate();
	const [announcement, setAnnouncement] = useState<string | null>(null);
	// File-routing nests `/projects/$projectId/tasks/$taskId` underneath this
	// route. Without delegating to the `<Outlet />` we'd render the task list
	// over the top of the guided task workspace. When any child match exists
	// we hand off rendering to the child route entirely.
	const hasChildRoute = useChildMatches().length > 0;

	const project = projects?.find((row) => row.id === projectId) ?? null;

	useEffect(() => {
		if (!announcement) return;
		const timer = window.setTimeout(() => setAnnouncement(null), 3000);
		return () => window.clearTimeout(timer);
	}, [announcement]);

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
			<output aria-live="polite" className="sr-only">
				{announcement ?? ""}
			</output>
			{project ? (
				<header className="flex items-start justify-between gap-4 border-border border-b pb-4">
					<div className="grid min-w-0 gap-1.5">
						<h1 className="m-0 truncate font-body font-semibold text-[1.625rem] text-foreground tracking-tight">
							{project.name}
						</h1>
						{project.description ? (
							<p className="m-0 max-w-[68ch] font-body text-[0.9375rem] text-ink-muted leading-6">
								{project.description}
							</p>
						) : null}
					</div>
					<ProjectActionsMenu
						onActionComplete={setAnnouncement}
						onDeleted={() => navigate({ to: "/projects" })}
						project={project}
						triggerClassName="text-ink-subtle hover:text-foreground"
					/>
				</header>
			) : null}
			<TaskList projectId={projectId} />
		</>
	);
}
