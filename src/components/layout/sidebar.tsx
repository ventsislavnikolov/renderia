import { Link, useLocation } from "@tanstack/react-router";
import { Folder, Layers, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
	getAuthHeaders,
	UNAUTHENTICATED_ERROR,
} from "../../lib/server-client/auth-headers";
import { supabaseBrowser } from "../../lib/supabase/browser";
import type { Tables } from "../../lib/types/database";
import { listProjects } from "../../server/projects";
import { listProjectTasks } from "../../server/tasks";

type ProjectRow = Tables<"projects">;
type TaskRow = Tables<"renovation_tasks">;

/**
 * Codex/Claude-style left rail. Re-fetches the project list whenever the
 * URL changes so a project created from the chat-prompt entry point shows
 * up in the rail without a manual refresh.
 *
 * On screens narrower than `md` the AppShell collapses the rail into a
 * horizontal strip at the top — Tailwind responsive utilities take care
 * of that here.
 */
export function Sidebar() {
	const location = useLocation();
	const [projects, setProjects] = useState<ProjectRow[] | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [signingOut, setSigningOut] = useState(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the rerun trigger by design
	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const headers = await getAuthHeaders();
				const rows = (await listProjects({ headers })) as ProjectRow[];
				if (!cancelled) {
					setProjects(rows);
					setLoadError(null);
				}
			} catch (error) {
				if (cancelled) return;
				if (error instanceof Error && error.message === UNAUTHENTICATED_ERROR) {
					window.location.assign("/auth");
					return;
				}
				setLoadError(
					error instanceof Error ? error.message : "Failed to load projects"
				);
				setProjects([]);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [location.pathname]);

	const activeProjectId = extractProjectIdFromPath(location.pathname);
	const activeTaskId = extractTaskIdFromPath(location.pathname);

	async function handleSignOut() {
		setSigningOut(true);
		try {
			await supabaseBrowser.auth.signOut();
		} finally {
			window.location.assign("/auth");
		}
	}

	return (
		<aside
			aria-label="Workspace"
			className={cn(
				"flex flex-col overflow-hidden bg-surface",
				"border-border border-b md:sticky md:top-0 md:h-screen md:border-r md:border-b-0",
				"px-3 pt-4 pb-3 md:max-h-none",
				"max-md:max-h-[50vh]"
			)}
		>
			<div className="px-3 pt-2 pb-4">
				<Link
					className="font-semibold text-[1.05rem] text-foreground leading-none tracking-tight"
					to="/"
				>
					Renderia
				</Link>
			</div>

			<nav aria-label="Primary" className="flex flex-col gap-0.5 pb-2">
				<SidebarLink icon={<Plus className="size-4" />} label="New" to="/" />
				<SidebarLink
					icon={<Layers className="size-4" />}
					label="Projects"
					to="/projects"
				/>
			</nav>

			<Separator className="mb-1" />

			<ScrollArea className="-mx-3 min-h-0 flex-1 px-3">
				<div className="px-3 pt-3 pb-1 font-body font-semibold text-[0.6875rem] text-ink-subtle uppercase tracking-[0.08em]">
					Projects
				</div>

				{projects === null ? (
					<p className="px-3 py-1 font-body text-ink-muted text-sm italic">
						Loading…
					</p>
				) : null}
				{loadError ? (
					<p
						className="px-3 py-1 font-body text-destructive text-sm italic"
						role="alert"
					>
						{loadError}
					</p>
				) : null}
				{projects && projects.length === 0 ? (
					<p className="px-3 py-1 font-body text-ink-muted text-sm italic">
						No projects yet.
					</p>
				) : null}
				{projects && projects.length > 0 ? (
					<ul className="m-0 flex flex-col gap-0.5 p-0">
						{projects.map((project) => (
							<SidebarProjectEntry
								activeProjectId={activeProjectId}
								activeTaskId={activeTaskId}
								key={project.id}
								project={project}
							/>
						))}
					</ul>
				) : null}
			</ScrollArea>

			<Separator className="mt-1" />

			<div className="pt-2">
				<Button
					className="w-full justify-start font-body text-ink-muted hover:bg-background hover:text-foreground"
					disabled={signingOut}
					onClick={handleSignOut}
					variant="ghost"
				>
					{signingOut ? "Signing out…" : "Sign out"}
				</Button>
			</div>
		</aside>
	);
}

function SidebarLink(props: {
	to: string;
	icon: React.ReactNode;
	label: string;
}) {
	const baseClass = cn(
		"flex items-center gap-3 rounded-md px-3 py-2",
		"font-body font-medium text-[0.9375rem] text-foreground tracking-tight",
		"transition-colors hover:bg-background"
	);
	return (
		<Link
			activeOptions={{ exact: true }}
			activeProps={{
				className: cn(
					baseClass,
					"bg-primary text-primary-foreground hover:bg-primary"
				),
			}}
			className={baseClass}
			to={props.to}
		>
			<span
				aria-hidden="true"
				className="inline-flex size-5 items-center justify-center"
			>
				{props.icon}
			</span>
			<span>{props.label}</span>
		</Link>
	);
}

function SidebarProjectEntry(props: {
	project: ProjectRow;
	activeProjectId: string | null;
	activeTaskId: string | null;
}) {
	const isActive = props.project.id === props.activeProjectId;
	const [tasks, setTasks] = useState<TaskRow[] | null>(null);
	const [tasksLoaded, setTasksLoaded] = useState(false);

	useEffect(() => {
		if (!isActive) {
			setTasks(null);
			setTasksLoaded(false);
			return;
		}
		let cancelled = false;
		(async () => {
			try {
				const headers = await getAuthHeaders();
				const rows = (await listProjectTasks({
					data: { projectId: props.project.id },
					headers,
				})) as TaskRow[];
				if (!cancelled) {
					setTasks(rows);
					setTasksLoaded(true);
				}
			} catch {
				if (!cancelled) {
					setTasks([]);
					setTasksLoaded(true);
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [isActive, props.project.id]);

	const projectClass = cn(
		"flex items-center gap-2.5 rounded-md px-3 py-1.5",
		"font-body font-medium text-foreground text-sm tracking-tight",
		"transition-colors hover:bg-background",
		isActive && "bg-background font-semibold"
	);

	return (
		<li>
			<Link
				className={projectClass}
				params={{ projectId: props.project.id }}
				to="/projects/$projectId"
			>
				<Folder aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
				<span className="flex-1 truncate">{props.project.name}</span>
			</Link>
			{isActive && tasksLoaded && tasks && tasks.length > 0 ? (
				<ul className="m-0 ml-5 flex flex-col gap-0 border-border border-l py-0.5 pl-3">
					{tasks.slice(0, 6).map((task) => (
						<li key={task.id}>
							<Link
								className={cn(
									"block truncate rounded px-2.5 py-1.5",
									"font-body font-medium text-[0.8125rem] text-ink-muted tracking-tight",
									"transition-colors hover:bg-background hover:text-foreground",
									task.id === props.activeTaskId &&
										"bg-background font-semibold text-foreground"
								)}
								params={{
									projectId: props.project.id,
									taskId: task.id,
								}}
								to="/projects/$projectId/tasks/$taskId"
							>
								{task.title}
							</Link>
						</li>
					))}
				</ul>
			) : null}
		</li>
	);
}

/** Pull the project id out of `/projects/<uuid>/...`. Returns null off-path. */
function extractProjectIdFromPath(pathname: string): string | null {
	const match = pathname.match(/^\/projects\/([^/]+)/);
	return match ? (match[1] ?? null) : null;
}

/** Pull the task id out of `/projects/<uuid>/tasks/<uuid>`. */
function extractTaskIdFromPath(pathname: string): string | null {
	const match = pathname.match(/^\/projects\/[^/]+\/tasks\/([^/]+)/);
	return match ? (match[1] ?? null) : null;
}
