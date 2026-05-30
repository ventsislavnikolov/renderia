import { Link, useLocation } from "@tanstack/react-router";
import { Folder, FolderOpen, Search, SquarePen } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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

export function Sidebar() {
	const location = useLocation();
	const [projects, setProjects] = useState<ProjectRow[] | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [signingOut, setSigningOut] = useState(false);
	const [searchOpen, setSearchOpen] = useState(false);

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
					window.location.assign("/sign-in");
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
			window.location.assign("/sign-in");
		}
	}

	return (
		<>
			<aside
				aria-label="Workspace"
				className={cn(
					"flex flex-col overflow-hidden bg-surface",
					"border-border border-b md:sticky md:top-0 md:h-screen md:w-[320px] md:border-r md:border-b-0",
					"px-3 pt-4 pb-4 md:max-h-none",
					"max-md:max-h-[50vh]"
				)}
			>
				<nav aria-label="Primary" className="flex flex-col gap-0.5 pb-4">
					<SidebarActionLink
						icon={<SquarePen className="size-5" />}
						label="New"
						to="/"
					/>
					<SidebarActionButton
						icon={<Search className="size-5" />}
						label="Search"
						onClick={() => setSearchOpen(true)}
					/>
				</nav>

				<ScrollArea className="-mx-3 min-h-0 flex-1 px-3">
					<div className="px-3 pt-1 pb-2 font-body font-semibold text-[0.75rem] text-ink-subtle uppercase tracking-[0.16em]">
						Projects
					</div>

					{projects === null ? (
						<p className="px-3 py-2 font-body text-[0.9375rem] text-ink-muted">
							Loading...
						</p>
					) : null}
					{loadError ? (
						<p
							className="px-3 py-2 font-body text-[0.9375rem] text-destructive"
							role="alert"
						>
							{loadError}
						</p>
					) : null}
					{projects && projects.length === 0 ? (
						<p className="px-3 py-2 font-body text-[0.9375rem] text-ink-muted">
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

				<div className="pt-2">
					<Button
						className="h-10 w-full justify-start rounded-lg px-3 font-body font-medium text-[0.9375rem] text-ink-muted hover:bg-background hover:text-foreground"
						disabled={signingOut}
						onClick={handleSignOut}
						variant="ghost"
					>
						{signingOut ? "Signing out..." : "Sign out"}
					</Button>
				</div>
			</aside>

			<SearchModal
				onOpenChange={(open) => setSearchOpen(open)}
				open={searchOpen}
				projects={projects ?? []}
			/>
		</>
	);
}

function SidebarActionLink(props: {
	to: string;
	icon: React.ReactNode;
	label: string;
}) {
	const baseClass = cn(
		"flex items-center gap-3 rounded-lg px-3 py-2.5",
		"font-body font-medium text-[1rem] text-foreground",
		"transition-colors hover:bg-background"
	);
	return (
		<Link
			activeOptions={{ exact: true }}
			activeProps={{ className: cn(baseClass, "bg-background font-semibold") }}
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

function SidebarActionButton(props: {
	icon: React.ReactNode;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			className={cn(
				"flex w-full items-center gap-3 rounded-lg px-3 py-2.5",
				"font-body font-medium text-[1rem] text-foreground",
				"transition-colors hover:bg-background"
			)}
			onClick={props.onClick}
			type="button"
		>
			<span
				aria-hidden="true"
				className="inline-flex size-5 items-center justify-center"
			>
				{props.icon}
			</span>
			<span>{props.label}</span>
		</button>
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
		"flex items-center gap-3 rounded-lg px-3 py-2",
		"font-body font-medium text-[0.9375rem] text-foreground",
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
				{isActive ? (
					<FolderOpen
						aria-hidden="true"
						className="size-5 shrink-0 text-ink-muted"
					/>
				) : (
					<Folder
						aria-hidden="true"
						className="size-5 shrink-0 text-ink-muted"
					/>
				)}
				<span className="flex-1 truncate">{props.project.name}</span>
			</Link>
			{isActive && tasksLoaded && tasks && tasks.length > 0 ? (
				<ul className="m-0 ml-8 flex flex-col gap-0 border-border border-l py-1 pl-3">
					{tasks.slice(0, 6).map((task) => (
						<li key={task.id}>
							<Link
								className={cn(
									"flex items-center justify-between rounded-md px-2 py-1.5",
									"font-body font-medium text-[0.875rem] text-ink-muted",
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
								<span className="flex-1 truncate">{task.title}</span>
								{task.updated_at ? (
									<span className="ml-2 shrink-0 text-[0.75rem] text-ink-subtle">
										{formatRelativeTime(task.updated_at)}
									</span>
								) : null}
							</Link>
						</li>
					))}
				</ul>
			) : null}
		</li>
	);
}

function SearchModal(props: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	projects: ProjectRow[];
}) {
	const [query, setQuery] = useState("");

	function handleOpenChange(open: boolean) {
		if (!open) setQuery("");
		props.onOpenChange(open);
	}

	const filtered = query.trim()
		? props.projects.filter((p) =>
				p.name.toLowerCase().includes(query.toLowerCase())
			)
		: props.projects;

	return (
		<Dialog onOpenChange={handleOpenChange} open={props.open}>
			<DialogContent
				className="gap-0 overflow-hidden p-0 sm:max-w-[480px]"
				showCloseButton={false}
			>
				<DialogTitle className="sr-only">Search projects</DialogTitle>
				<div className="flex items-center border-b px-4">
					<Search className="mr-3 size-4 shrink-0 text-ink-muted" />
					<Input
						autoFocus
						className="h-12 border-0 bg-transparent px-0 text-[1rem] shadow-none focus-visible:ring-0"
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Search projects..."
						value={query}
					/>
				</div>
				<ScrollArea className="max-h-[320px]">
					{filtered.length === 0 ? (
						<p className="px-4 py-6 text-center text-[0.9375rem] text-ink-muted">
							No projects found.
						</p>
					) : (
						<ul className="m-0 p-2">
							{filtered.map((project) => (
								<li key={project.id}>
									<Link
										className={cn(
											"flex items-center gap-3 rounded-lg px-3 py-2.5",
											"font-body text-[0.9375rem] text-foreground",
											"transition-colors hover:bg-surface"
										)}
										onClick={() => props.onOpenChange(false)}
										params={{ projectId: project.id }}
										to="/projects/$projectId"
									>
										<Folder className="size-4 shrink-0 text-ink-muted" />
										<span className="truncate">{project.name}</span>
									</Link>
								</li>
							))}
						</ul>
					)}
				</ScrollArea>
			</DialogContent>
		</Dialog>
	);
}

function formatRelativeTime(isoString: string): string {
	const ms = Date.now() - new Date(isoString).getTime();
	const minutes = Math.floor(ms / 60_000);
	if (minutes < 1) return "now";
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.floor(hours / 24);
	return `${days}d`;
}

function extractProjectIdFromPath(pathname: string): string | null {
	const match = pathname.match(/^\/projects\/([^/]+)/);
	return match ? (match[1] ?? null) : null;
}

function extractTaskIdFromPath(pathname: string): string | null {
	const match = pathname.match(/^\/projects\/[^/]+\/tasks\/([^/]+)/);
	return match ? (match[1] ?? null) : null;
}
