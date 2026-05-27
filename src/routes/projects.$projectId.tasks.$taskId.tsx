import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { GuidedFlow } from "../components/guided/guided-flow";
import { AppShell } from "../components/layout/app-shell";
import {
	getAuthHeaders,
	UNAUTHENTICATED_ERROR,
} from "../lib/server-client/auth-headers";
import { supabaseBrowser } from "../lib/supabase/browser";
import type { Tables } from "../lib/types/database";
import { listProjectTasks } from "../server/tasks";

type TaskRow = Tables<"renovation_tasks">;

/**
 * `/projects/:projectId/tasks/:taskId` — guided task workspace.
 *
 * Owns the route's auth guard and the lookup that resolves the task title
 * for the breadcrumb + guided flow header. The flow itself lives in
 * `GuidedFlow` so the route stays a thin glue layer.
 */
export const Route = createFileRoute("/projects/$projectId/tasks/$taskId")({
	ssr: false,
	beforeLoad: async () => {
		const {
			data: { session },
		} = await supabaseBrowser.auth.getSession();
		if (!session) {
			throw redirect({ to: "/auth" });
		}
	},
	component: TaskWorkspaceRoute,
});

function TaskWorkspaceRoute() {
	const { projectId, taskId } = Route.useParams();
	const [task, setTask] = useState<TaskRow | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const cancelledRef = useRef(false);

	useEffect(() => {
		cancelledRef.current = false;
		(async () => {
			try {
				const headers = await getAuthHeaders();
				// We use `listProjectTasks` rather than a dedicated `getTask`
				// because no such server fn exists yet — the list is bounded by
				// project size for the MVP, and adding `getTask` is out of
				// scope for this task. Swap in a single-row fetch once that
				// server fn lands.
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
					window.location.assign("/auth");
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
	}, [projectId, taskId]);

	const breadcrumbs = (
		<>
			<Link to="/projects">Projects</Link>
			<span aria-hidden="true"> / </span>
			<Link params={{ projectId }} to="/projects/$projectId">
				Project
			</Link>
			<span aria-hidden="true"> / </span>
			<span aria-current="page">{task?.title ?? "…"}</span>
		</>
	);

	return (
		<AppShell breadcrumbs={breadcrumbs}>
			<section className="grid gap-8">
				<header className="grid gap-2">
					<h1 className="m-0 font-display font-medium text-4xl text-foreground tracking-tight">
						{task?.title ?? "Renovation task"}
					</h1>
					{task?.notes ? (
						<p className="m-0 max-w-[60ch] font-body text-base text-ink-muted leading-relaxed">
							{task.notes}
						</p>
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
						projectId={projectId}
						taskId={taskId}
						taskTitle={task.title}
					/>
				) : loadError ? null : (
					<output className="block text-[0.9375rem] text-ink-muted italic">
						Loading task…
					</output>
				)}
			</section>
		</AppShell>
	);
}
