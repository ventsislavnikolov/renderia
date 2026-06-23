import { Link, useLocation } from "@tanstack/react-router";
import {
	ChevronsUpDown,
	Folder,
	FolderOpen,
	LogOut,
	Menu,
	Search,
	Sofa,
	SquarePen,
	Star,
	X,
} from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { type ReactNode, useEffect, useState } from "react";
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
	const [drawerOpen, setDrawerOpen] = useState(false);
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

	// Close the mobile drawer whenever the route changes so a tapped link never
	// leaves the off-canvas panel open over the new page.
	// biome-ignore lint/correctness/useExhaustiveDependencies: close on path change only.
	useEffect(() => {
		setDrawerOpen(false);
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

	const renderContent = (onNavigate?: () => void) => (
		<SidebarContent
			activeProjectId={activeProjectId}
			activeTaskId={activeTaskId}
			email={userEmail}
			loadError={loadError}
			onNavigate={onNavigate}
			onSearch={() => {
				onNavigate?.();
				setSearchOpen(true);
			}}
			onSignOut={handleSignOut}
			projects={projects}
			signingOut={signingOut}
			tasksMap={tasksMap}
		/>
	);

	return (
		<>
			{/* Persistent desktop rail — hidden below the md breakpoint. */}
			<aside
				aria-label="Workspace"
				className={cn(
					"hidden bg-surface md:flex md:flex-col md:overflow-hidden",
					"md:sticky md:top-0 md:h-screen md:w-[320px] md:border-border md:border-r",
					"md:px-3 md:pt-4 md:pb-4"
				)}
			>
				{renderContent()}
			</aside>

			{/* Compact top bar + off-canvas drawer — mobile only. */}
			<MobileNav onOpenChange={setDrawerOpen} open={drawerOpen}>
				{renderContent(() => setDrawerOpen(false))}
			</MobileNav>

			<SearchModal
				onOpenChange={(open) => setSearchOpen(open)}
				open={searchOpen}
				projects={projects ?? []}
			/>
		</>
	);
}

/**
 * Presentational sidebar body shared by the desktop rail and the mobile
 * drawer. State lives in {@link Sidebar}; `onNavigate` (when provided by the
 * drawer) closes the panel as the user activates a link or the search action.
 */
function SidebarContent(props: {
	projects: ProjectRow[] | null;
	tasksMap: Record<string, TaskRow[]>;
	loadError: string | null;
	activeProjectId: string | null;
	activeTaskId: string | null;
	email: string | null;
	signingOut: boolean;
	onSearch: () => void;
	onSignOut: () => void;
	onNavigate?: () => void;
}) {
	return (
		<>
			<nav aria-label="Primary" className="flex flex-col gap-0.5 pb-4">
				<SidebarActionLink
					icon={<SquarePen className="size-5" />}
					label="New"
					onNavigate={props.onNavigate}
					to="/"
				/>
				<SidebarActionButton
					icon={<Search className="size-5" />}
					label="Search"
					onClick={props.onSearch}
				/>
				<SidebarActionLink
					icon={<Star className="size-5" />}
					label="Favorites"
					onNavigate={props.onNavigate}
					to="/favorites"
				/>
				<SidebarActionLink
					icon={<Sofa className="size-5" />}
					label="Furniture"
					onNavigate={props.onNavigate}
					to="/furniture"
				/>
			</nav>

			<ScrollArea className="-mx-3 min-h-0 flex-1 px-3">
				<div className="px-3 pt-1 pb-3 font-body font-bold text-[0.9375rem] text-foreground">
					Projects
				</div>

				{props.projects === null ? (
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
				{props.loadError ? (
					<p
						className="px-3 py-2 font-body text-[0.9375rem] text-destructive"
						role="alert"
					>
						{props.loadError}
					</p>
				) : null}
				{props.projects && props.projects.length === 0 ? (
					<p className="px-3 py-2 font-body text-[0.9375rem] text-ink-muted">
						No projects yet.
					</p>
				) : null}
				{props.projects && props.projects.length > 0 ? (
					<ul className="m-0 flex flex-col gap-0.5 p-0">
						{props.projects.map((project) => (
							<SidebarProjectEntry
								activeProjectId={props.activeProjectId}
								activeTaskId={props.activeTaskId}
								key={project.id}
								onNavigate={props.onNavigate}
								project={project}
								tasks={props.tasksMap[project.id]}
							/>
						))}
					</ul>
				) : null}
			</ScrollArea>

			<div className="border-border border-t pt-2">
				<UserMenu
					email={props.email}
					onSignOut={props.onSignOut}
					signingOut={props.signingOut}
				/>
			</div>
		</>
	);
}

/**
 * Mobile-only navigation: a compact top bar whose menu button opens the shared
 * sidebar content as a left off-canvas drawer. Built on the Radix Dialog
 * primitive, so it traps and restores focus, closes on Escape / overlay click,
 * and — because the panel is portalled only while open — never intercepts
 * pointer events on the page when closed.
 */
function MobileNav(props: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	children: ReactNode;
}) {
	return (
		<DialogPrimitive.Root onOpenChange={props.onOpenChange} open={props.open}>
			<div className="flex items-center gap-3 border-border border-b bg-surface px-4 py-3 md:hidden">
				<DialogPrimitive.Trigger asChild>
					<button
						aria-label="Open navigation menu"
						className={cn(
							"inline-flex size-9 items-center justify-center rounded-lg",
							"text-foreground transition-colors hover:bg-background",
							"focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
						)}
						type="button"
					>
						<Menu className="size-5" />
					</button>
				</DialogPrimitive.Trigger>
				<span className="font-display font-semibold text-[1.0625rem] text-foreground tracking-tight">
					Renderia
				</span>
			</div>

			<DialogPrimitive.Portal>
				<DialogPrimitive.Overlay
					className={cn(
						"data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
						"data-[state=closed]:animate-out data-[state=open]:animate-in md:hidden"
					)}
				/>
				<DialogPrimitive.Content
					aria-describedby={undefined}
					className={cn(
						"fixed inset-y-0 left-0 z-50 flex w-[300px] max-w-[85vw] flex-col overflow-hidden",
						"bg-surface px-3 pt-4 pb-4 shadow-lg outline-none",
						"data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
						"duration-200 data-[state=closed]:animate-out data-[state=open]:animate-in md:hidden"
					)}
				>
					<DialogPrimitive.Title className="sr-only">
						Navigation
					</DialogPrimitive.Title>
					<DialogPrimitive.Close asChild>
						<button
							aria-label="Close navigation menu"
							className={cn(
								"absolute top-3 right-3 inline-flex size-8 items-center justify-center rounded-lg",
								"text-ink-muted transition-colors hover:bg-background hover:text-foreground",
								"focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
							)}
							type="button"
						>
							<X className="size-5" />
						</button>
					</DialogPrimitive.Close>
					{props.children}
				</DialogPrimitive.Content>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
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
	onNavigate?: () => void;
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
			onClick={props.onNavigate}
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
	onNavigate?: () => void;
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
				onClick={props.onNavigate}
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
								onClick={props.onNavigate}
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
