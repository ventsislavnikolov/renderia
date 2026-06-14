import type { ReactNode } from "react";
import { WorkspaceProvider } from "../../lib/workspace-context";
import { Sidebar } from "./sidebar";

export function Breadcrumbs({ children }: { children: ReactNode }) {
	return (
		<nav
			aria-label="Breadcrumb"
			className="mb-6 flex items-center gap-2 font-medium text-[0.8125rem] text-ink-muted tracking-tight [&_[aria-current=page]]:font-semibold [&_[aria-current=page]]:text-foreground [&_a:focus-visible]:border-foreground [&_a:focus-visible]:outline-none [&_a:hover]:border-foreground [&_a]:border-transparent [&_a]:border-b [&_a]:text-foreground [&_a]:no-underline [&_a]:transition-[border-color]"
		>
			{children}
		</nav>
	);
}

/**
 * Authenticated workspace shell.
 *
 * Two-column layout: 260px left rail with navigation + project tree, right
 * pane is the route's main content. Optional `breadcrumbs` slot renders
 * above the main body so routes that had breadcrumbs before keep them.
 *
 * On screens narrower than `md` (768px) the grid collapses to a single
 * column and the sidebar becomes a horizontal strip at the top — see the
 * Sidebar component for its own responsive behavior.
 */
export function AppShell(props: {
	children: ReactNode;
	breadcrumbs?: ReactNode;
}) {
	return (
		<WorkspaceProvider>
			<div className="grid min-h-screen md:grid-cols-[320px_1fr]">
				<Sidebar />
				<main className="mx-auto w-full max-w-[1280px] px-6 py-10 md:px-12 md:py-10">
					{props.breadcrumbs ? (
						<nav
							aria-label="Breadcrumb"
							className="mb-6 flex items-center gap-2 font-medium text-[0.8125rem] text-ink-muted tracking-tight [&_[aria-current=page]]:font-semibold [&_[aria-current=page]]:text-foreground [&_a:focus-visible]:border-foreground [&_a:focus-visible]:outline-none [&_a:hover]:border-foreground [&_a]:border-transparent [&_a]:border-b [&_a]:text-foreground [&_a]:no-underline [&_a]:transition-[border-color]"
						>
							{props.breadcrumbs}
						</nav>
					) : null}
					{props.children}
				</main>
			</div>
		</WorkspaceProvider>
	);
}
