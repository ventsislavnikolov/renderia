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
const getUserMock = vi.fn();

vi.mock("../../../src/lib/server-client/auth-headers", () => ({
	getAuthHeaders: vi.fn(async () => ({ Authorization: "Bearer test" })),
	UNAUTHENTICATED_ERROR: "UNAUTHENTICATED",
}));

vi.mock("../../../src/lib/supabase/browser", () => ({
	supabaseBrowser: {
		auth: {
			signOut: (...args: unknown[]) => signOutMock(...args),
			getUser: (...args: unknown[]) => getUserMock(...args),
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
import { WorkspaceProvider } from "../../../src/lib/workspace-context";

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
	return render(
		<WorkspaceProvider>
			<RouterProvider router={router} />
		</WorkspaceProvider>
	);
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
		getUserMock.mockResolvedValue({
			data: { user: { email: "user@example.com" } },
		});
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

	it("links to the Furniture library after Favorites", async () => {
		renderSidebar("/projects");

		const furniture = await screen.findByRole("link", {
			name: /^furniture$/i,
		});
		expect(furniture).toHaveAttribute("href", "/furniture");

		const labels = screen
			.getAllByRole("link")
			.map((link) => link.textContent?.trim());
		expect(labels.indexOf("Furniture")).toBeGreaterThan(
			labels.indexOf("Favorites")
		);
	});

	it("renders the account menu trigger with the user's email", async () => {
		renderSidebar("/projects");

		expect(
			await screen.findByRole("button", { name: /user@example\.com/i })
		).toBeDefined();
	});

	it("gives nav links and the search button a visible design-system focus ring", async () => {
		renderSidebar("/projects");

		const newLink = await screen.findByRole("link", { name: /^new$/i });
		expect(newLink.className).toContain("focus-visible:ring-[3px]");
		expect(newLink.className).toContain("focus-visible:ring-ring/50");

		const search = screen.getByRole("button", { name: /^search$/i });
		expect(search.className).toContain("focus-visible:ring-[3px]");

		const project = await screen.findByRole("link", { name: /pleven/i });
		expect(project.className).toContain("focus-visible:ring-[3px]");
	});

	it("uses the design-system ring on the account menu trigger", async () => {
		renderSidebar("/projects");

		const trigger = await screen.findByRole("button", {
			name: /user@example\.com/i,
		});
		expect(trigger.className).toContain("focus-visible:ring-[3px]");
		expect(trigger.className).toContain("focus-visible:ring-ring/50");
	});
});
