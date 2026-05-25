import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

/**
 * Authenticated workspace shell. Wraps every signed-in route with a top bar
 * and a `<main>` content container. Kept dependency-free on purpose so any
 * route can render inside it — the guided-flow route added in Task 8 reuses
 * the same shell.
 */
export function AppShell(props: {
	children: ReactNode;
	breadcrumbs?: ReactNode;
}) {
	return (
		<div className="app-shell">
			<header className="topbar">
				<Link to="/projects" className="brand">
					<strong>Renderia</strong>
				</Link>
				{props.breadcrumbs ? (
					<nav aria-label="Breadcrumb" className="breadcrumbs">
						{props.breadcrumbs}
					</nav>
				) : null}
			</header>
			<main className="workspace-main">{props.children}</main>
		</div>
	);
}
