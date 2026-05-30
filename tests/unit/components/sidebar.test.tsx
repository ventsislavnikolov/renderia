import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listProjectsMock = vi.fn();
const listProjectTasksMock = vi.fn();
const signOutMock = vi.fn();

vi.mock("../../../src/lib/server-client/auth-headers", () => ({
	getAuthHeaders: vi.fn(async () => ({ Authorization: "Bearer test" })),
	UNAUTHENTICATED_ERROR: "UNAUTHENTICATED",
}));

vi.mock("../../../src/lib/supabase/browser", () => ({
	supabaseBrowser: {
		auth: {
			signOut: (...args: unknown[]) => signOutMock(...args),
		},
	},
}));

vi.mock("../../../src/server/projects", () => ({
	listProjects: (...args: unknown[]) => listProjectsMock(...args),
}));

vi.mock("../../../src/server/tasks", () => ({
	listProjectTasks: (...args: unknown[]) => listProjectTasksMock(...args),
}));

import { Sidebar } from "../../../src/components/layout/sidebar";

function renderSidebar(initialPath = "/projects") {
	const rootRoute = createRootRoute({ component: Outlet });
	const indexRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/",
		component: () => <Sidebar />,
	});
	const projectsRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/projects",
		component: () => <Sidebar />,
	});
	const projectRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/projects/$projectId",
		component: () => <Sidebar />,
	});
	const taskRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/projects/$projectId/tasks/$taskId",
		component: () => <Sidebar />,
	});
	const router = createRouter({
		routeTree: rootRoute.addChildren([
			indexRoute,
			projectsRoute,
			projectRoute,
			taskRoute,
		]),
		history: createMemoryHistory({ initialEntries: [initialPath] }),
	});
	return render(<RouterProvider router={router} />);
}

describe("Sidebar", () => {
	beforeEach(() => {
		listProjectsMock.mockResolvedValue([
			{
				id: "project-1",
				name: "Pleven",
				description: null,
			},
		]);
		listProjectTasksMock.mockResolvedValue([]);
		signOutMock.mockResolvedValue(undefined);
	});

	it("renders wide rail with action items and project list", async () => {
		renderSidebar("/projects");

		const rail = await screen.findByRole("complementary", {
			name: /workspace/i,
		});
		expect(rail).toHaveClass("md:w-[320px]");

		expect(screen.getByRole("link", { name: /^new$/i })).toBeDefined();
		expect(screen.getByRole("button", { name: /^search$/i })).toBeDefined();

		expect(await screen.findByRole("link", { name: /pleven/i })).toBeDefined();
	});
});
