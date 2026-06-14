import { Link, useLocation } from "@tanstack/react-router";
import {
	ChevronsUpDown,
	Folder,
	FolderOpen,
	LogOut,
	Search,
	Sofa,
	SquarePen,
	Star,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "../../lib/format";
import { supabaseBrowser } from "../../lib/supabase/browser";
import type { Tables } from "../../lib/types/database";
import { useWorkspace } from "../../lib/workspace-context";

type ProjectRow = Tables<"projects">;
type TaskRow = Tables<"renovation_tasks">;

export function Sidebar() {
	const location = useLocation();
	const { projects, tasksMap, loadError } = useWorkspace();
	const [signingOut, setSigningOut] = useState(false);
	const [searchOpen, setSearchOpen] = useState(false);
	const [userEmail, setUserEmail] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			const { data } = await supabaseBrowser.auth.getUser();
			if (!cancelled) setUserEmail(data.user?.email ?? null);
		})();
		return () => {
			cancelled = true;
		};
	}, []);

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
					<SidebarActionLink
						icon={<Star className="size-5" />}
						label="Favorites"
						to="/favorites"
					/>
					<SidebarActionLink
						icon={<Sofa className="size-5" />}
						label="Furniture"
						to="/furniture"
					/>
				</nav>

				<ScrollArea className="-mx-3 min-h-0 flex-1 px-3">
					<div className="px-3 pt-1 pb-3 font-body font-bold text-[0.9375rem] text-foreground">
						Projects
					</div>

					{projects === null ? (
						<div className="flex flex-col gap-0.5">
							{/* active project skeleton */}
							<div className="flex items-center gap-3 rounded-lg bg-background px-3 py-2">
								<Skeleton className="size-[18px] shrink-0 rounded-sm" />
								<Skeleton className="h-3.5 w-[96px]" />
							</div>
							{/* task skeletons */}
							<div className="flex flex-col gap-0 pl-9">
								{[100, 140].map((w) => (
									<div
										className="flex items-center justify-between px-3 py-1.5"
										key={w}
									>
										<Skeleton className="h-3 rounded" style={{ width: w }} />
										<Skeleton className="ml-2 h-3 w-6 rounded" />
									</div>
								))}
							</div>
							{/* inactive project skeletons */}
							{[80, 112].map((w) => (
								<div className="flex items-center gap-3 px-3 py-2" key={w}>
									<Skeleton className="size-[18px] shrink-0 rounded-sm" />
									<Skeleton className="h-3.5 rounded" style={{ width: w }} />
								</div>
							))}
						</div>
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
									tasks={tasksMap[project.id]}
								/>
							))}
						</ul>
					) : null}
				</ScrollArea>

				<div className="border-border border-t pt-2">
					<UserMenu
						email={userEmail}
						onSignOut={handleSignOut}
						signingOut={signingOut}
					/>
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

function getInitials(email: string | null): string {
	if (!email) return "?";
	const namePart = email.split("@")[0] ?? "";
	const segments = namePart.split(/[.\-_+]/).filter(Boolean);
	if (segments.length >= 2) {
		return `${segments[0]?.[0] ?? ""}${segments[1]?.[0] ?? ""}`.toUpperCase();
	}
	return namePart.slice(0, 2).toUpperCase() || "?";
}

function UserMenu(props: {
	email: string | null;
	signingOut: boolean;
	onSignOut: () => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					className={cn(
						"flex w-full items-center gap-3 rounded-lg px-2 py-2",
						"text-left transition-colors hover:bg-background",
						"focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
					)}
					type="button"
				>
					<span
						aria-hidden="true"
						className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground font-body font-semibold text-[0.75rem] text-background"
					>
						{getInitials(props.email)}
					</span>
					<span className="min-w-0 flex-1">
						<span className="block truncate font-body font-medium text-[0.875rem] text-foreground">
							{props.email ?? "Account"}
						</span>
					</span>
					<ChevronsUpDown
						aria-hidden="true"
						className="size-4 shrink-0 text-ink-muted"
					/>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[220px]"
				side="top"
				sideOffset={8}
			>
				{props.email ? (
					<>
						<DropdownMenuLabel className="truncate font-normal text-ink-muted text-xs">
							{props.email}
						</DropdownMenuLabel>
						<DropdownMenuSeparator />
					</>
				) : null}
				<DropdownMenuItem
					disabled={props.signingOut}
					onSelect={(event) => {
						event.preventDefault();
						props.onSignOut();
					}}
					variant="destructive"
				>
					<LogOut className="size-4" />
					{props.signingOut ? "Signing out..." : "Sign out"}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
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
		"transition-colors hover:bg-background",
		"focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
				"transition-colors hover:bg-background",
				"focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
	tasks: TaskRow[] | undefined;
}) {
	const isActive = props.project.id === props.activeProjectId;
	const tasks = props.tasks;

	return (
		<li>
			<Link
				className={cn(
					"flex items-center gap-3 rounded-lg px-3 py-2",
					"font-body text-[0.9375rem] text-foreground transition-colors",
					"focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
					isActive
						? "bg-background font-semibold"
						: "font-medium text-ink-muted hover:bg-background hover:text-foreground"
				)}
				params={{ projectId: props.project.id }}
				to="/projects/$projectId"
			>
				{isActive ? (
					<FolderOpen aria-hidden="true" className="size-[18px] shrink-0" />
				) : (
					<Folder
						aria-hidden="true"
						className="size-[18px] shrink-0 text-ink-muted"
					/>
				)}
				<span className="flex-1 truncate">{props.project.name}</span>
			</Link>
			{isActive && tasks && tasks.length > 0 ? (
				<ul className="m-0 mt-0.5 flex flex-col gap-0 pl-9">
					{tasks.slice(0, 6).map((task) => (
						<li key={task.id}>
							<Link
								className={cn(
									"flex items-center justify-between rounded-lg px-3 py-1.5",
									"font-body text-[0.875rem] transition-colors",
									"focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
									task.id === props.activeTaskId
										? "bg-background font-medium text-foreground"
										: "text-ink-muted hover:bg-background hover:text-foreground"
								)}
								params={{
									projectId: props.project.id,
									taskId: task.id,
								}}
								to="/projects/$projectId/tasks/$taskId"
							>
								<span className="flex-1 truncate">{task.title}</span>
								{task.updated_at ? (
									<span className="ml-2 shrink-0 text-[0.75rem] text-ink-subtle tabular-nums">
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
											"transition-colors hover:bg-surface",
											"focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
										)}
										onClick={() => props.onOpenChange(false)}
										params={{ projectId: project.id }}
										to="/projects/$projectId"
									>
										<Folder className="size-[18px] shrink-0 text-ink-muted" />
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

function extractProjectIdFromPath(pathname: string): string | null {
	const match = pathname.match(/^\/projects\/([^/]+)/);
	return match ? (match[1] ?? null) : null;
}

function extractTaskIdFromPath(pathname: string): string | null {
	const match = pathname.match(/^\/projects\/[^/]+\/tasks\/([^/]+)/);
	return match ? (match[1] ?? null) : null;
}
