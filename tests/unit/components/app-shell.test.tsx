import { render, screen } from "@testing-library/react";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { AppShell } from "../../../src/components/layout/app-shell";

/**
 * Render `AppShell` inside a minimal in-memory TanStack Router so the
 * `<Link to="/projects">` brand link can resolve without a real shell.
 *
 * The shell itself is pure UI — no server fns, no Supabase. The test only
 * needs to confirm the brand renders, breadcrumbs render when supplied,
 * and child content slots in.
 */
function renderShell(props: {
	breadcrumbs?: React.ReactNode;
	children: React.ReactNode;
}) {
	const rootRoute = createRootRoute({ component: Outlet });
	const indexRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/",
		component: () => <AppShell {...props} />,
	});
	const projectsRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/projects",
		component: () => <div>projects-stub</div>,
	});
	const router = createRouter({
		routeTree: rootRoute.addChildren([indexRoute, projectsRoute]),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	return render(<RouterProvider router={router} />);
}

describe("AppShell", () => {
	it("renders the brand link and child content", async () => {
		renderShell({ children: <p>child-content</p> });
		expect(
			await screen.findByRole("link", { name: /renderia/i }),
		).toBeDefined();
		expect(await screen.findByText("child-content")).toBeDefined();
	});

	it("renders breadcrumbs when supplied", async () => {
		renderShell({
			breadcrumbs: <span>crumb-content</span>,
			children: <p>body</p>,
		});
		expect(
			await screen.findByRole("navigation", { name: /breadcrumb/i }),
		).toBeDefined();
		expect(await screen.findByText("crumb-content")).toBeDefined();
	});
});
