import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { GuidedFlow } from "../components/guided/guided-flow";
import { Breadcrumbs } from "../components/layout/app-shell";
import { RoomActionsMenu } from "../components/tasks/task-actions-menu";
import {
	getAuthHeaders,
	UNAUTHENTICATED_ERROR,
} from "../lib/server-client/auth-headers";
import type { Tables } from "../lib/types/database";
import { useWorkspace } from "../lib/workspace-context";
import { listProjectTasks } from "../server/tasks";

type TaskRow = Tables<"renovation_tasks">;

/**
 * `/projects/:projectId/tasks/:taskId` — guided task workspace.
 *
 * Auth lives in the `_app` layout. The task is resolved from the shared
 * workspace context (prefetched by the shell) for an instant open; a direct
 * fetch is the fallback only when the room isn't in the cache yet. The flow
 * itself lives in `GuidedFlow` so the route stays a thin glue layer.
 */
export const Route = createFileRoute("/_app/projects/$projectId/tasks/$taskId")(
	{
		ssr: false,
		component: TaskWorkspaceRoute,
	}
);

function TaskWorkspaceRoute() {
	const { projectId, taskId } = Route.useParams();
	const navigate = useNavigate();
	const { projects, tasksMap } = useWorkspace();
	const cachedTask =
		tasksMap[projectId]?.find((row) => row.id === taskId) ?? null;
	const [task, setTask] = useState<TaskRow | null>(cachedTask);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [announcement, setAnnouncement] = useState<string | null>(null);
	const cancelledRef = useRef(false);

	useEffect(() => {
		if (!announcement) return;
		const timer = window.setTimeout(() => setAnnouncement(null), 3000);
		return () => window.clearTimeout(timer);
	}, [announcement]);

	useEffect(() => {
		cancelledRef.current = false;
		if (cachedTask) {
			setTask(cachedTask);
			return () => {
				cancelledRef.current = true;
			};
		}
		(async () => {
			try {
				// Fallback for a cache miss (e.g. deep link before the shell's
				// prefetch settles). `listProjectTasks` stands in until a
				// dedicated `getTask` server fn exists.
				const headers = await getAuthHeaders();
				const rows: TaskRow[] = await listProjectTasks({
					data: { projectId },
					headers,
				});
				if (cancelledRef.current) return;
				const match = rows.find((row) => row.id === taskId) ?? null;
				setTask(match);
				if (!match) {
					setLoadError("Task not found.");
				}
			} catch (caught) {
				if (cancelledRef.current) return;
				if (
					caught instanceof Error &&
					caught.message === UNAUTHENTICATED_ERROR
				) {
					window.location.assign("/sign-in");
					return;
				}
				setLoadError(
					caught instanceof Error ? caught.message : "Failed to load task"
				);
			}
		})();
		return () => {
			cancelledRef.current = true;
		};
	}, [projectId, taskId, cachedTask]);

	const project = projects?.find((row) => row.id === projectId) ?? null;

	const breadcrumbs = (
		<>
			<Link to="/projects">Projects</Link>
			<span aria-hidden="true"> / </span>
			<Link params={{ projectId }} to="/projects/$projectId">
				{project?.name ?? "Project"}
			</Link>
			<span aria-hidden="true"> / </span>
			<span aria-current="page">{task?.title ?? "…"}</span>
		</>
	);

	return (
		<>
			<Breadcrumbs>{breadcrumbs}</Breadcrumbs>
			<output aria-live="polite" className="sr-only">
				{announcement ?? ""}
			</output>
			<section className="grid gap-8">
				<header className="flex items-start justify-between gap-4">
					<div className="grid min-w-0 gap-2">
						<h1 className="m-0 font-display font-medium text-4xl text-foreground tracking-tight">
							{task?.title ?? "Renovation task"}
						</h1>
						{task?.notes ? (
							<p className="m-0 max-w-[60ch] font-body text-base text-ink-muted leading-relaxed">
								{task.notes}
							</p>
						) : null}
					</div>
					{task ? (
						<RoomActionsMenu
							onActionComplete={setAnnouncement}
							onDeleted={() =>
								navigate({
									params: { projectId },
									to: "/projects/$projectId",
								})
							}
							task={task}
							triggerClassName="text-ink-subtle hover:text-foreground"
						/>
					) : null}
				</header>
				{loadError ? (
					<p
						className="m-0 font-medium text-[0.9375rem] text-warning"
						role="alert"
					>
						{loadError}
					</p>
				) : null}
				{task ? (
					<GuidedFlow
						key={taskId}
						projectId={projectId}
						taskId={taskId}
						taskTitle={task.title}
					/>
				) : loadError ? null : (
					<div className="grid gap-8 border border-border bg-surface p-10 max-md:p-6">
						<div className="grid gap-3">
							<Skeleton className="h-7 w-[240px]" />
							<Skeleton className="h-5 w-[160px]" />
						</div>
						<Skeleton className="h-64 w-full" />
					</div>
				)}
			</section>
		</>
	);
}
