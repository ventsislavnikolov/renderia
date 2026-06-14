import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listProjectsMock = vi.fn();
const createProjectMock = vi.fn();
const listProjectTasksMock = vi.fn();
const createTaskMock = vi.fn();

vi.mock("../../../src/lib/server-client/auth-headers", () => ({
	getAuthHeaders: vi.fn(async () => ({ Authorization: "Bearer test" })),
	UNAUTHENTICATED_ERROR: "UNAUTHENTICATED",
}));

vi.mock("../../../src/server/projects", () => ({
	listProjects: (...args: unknown[]) => listProjectsMock(...args),
	createProject: (...args: unknown[]) => createProjectMock(...args),
}));

vi.mock("../../../src/server/tasks", () => ({
	listProjectTasks: (...args: unknown[]) => listProjectTasksMock(...args),
	createTask: (...args: unknown[]) => createTaskMock(...args),
}));

import { ProjectList } from "../../../src/components/projects/project-list";
import { TaskList } from "../../../src/components/tasks/task-list";
import { WorkspaceProvider } from "../../../src/lib/workspace-context";

function renderWithRouter(component: React.ReactNode) {
	const rootRoute = createRootRoute({ component: Outlet });
	const indexRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/",
		component: () => component,
	});
	const projectsRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/projects",
		component: () => <div>projects route</div>,
	});
	const projectRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/projects/$projectId",
		component: () => <div>project detail</div>,
	});
	const taskRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/projects/$projectId/tasks/$taskId",
		component: () => <div>task detail</div>,
	});
	const router = createRouter({
		routeTree: rootRoute.addChildren([
			indexRoute,
			projectsRoute,
			projectRoute,
			taskRoute,
		]),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});

	return render(
		<WorkspaceProvider>
			<RouterProvider router={router} />
		</WorkspaceProvider>
	);
}

describe("ProjectList", () => {
	beforeEach(() => {
		listProjectsMock.mockResolvedValue([
			{
				id: "project-1",
				name: "City house",
				description: "Main renovation workspace",
			},
		]);
		createProjectMock.mockResolvedValue({});
	});

	it("keeps project creation behind a header button and modal", async () => {
		const user = userEvent.setup();
		renderWithRouter(<ProjectList />);

		expect(
			await screen.findByRole("link", { name: /city house/i })
		).toBeDefined();
		expect(screen.queryByLabelText(/^name$/i)).toBeNull();

		await user.click(screen.getByRole("button", { name: /new project/i }));

		const dialog = await screen.findByRole("dialog", { name: /new project/i });
		expect(within(dialog).getByLabelText(/^name$/i)).toBeDefined();
		expect(
			within(dialog).getByRole("button", { name: /create project/i })
		).toBeDefined();
	});

	it("gives the project row link a visible design-system focus ring", async () => {
		renderWithRouter(<ProjectList />);

		const link = await screen.findByRole("link", { name: /city house/i });
		expect(link.className).toContain("focus-visible:ring-[3px]");
		expect(link.className).toContain("focus-visible:ring-ring/50");
	});
});

describe("TaskList", () => {
	beforeEach(() => {
		listProjectTasksMock.mockResolvedValue([
			{
				id: "task-1",
				project_id: "project-1",
				title: "Living room",
				category: "room",
				status: "draft",
				notes: "Keep the fireplace wall.",
			},
		]);
		createTaskMock.mockResolvedValue({});
	});

	it("keeps room creation behind a header button and modal", async () => {
		const user = userEvent.setup();
		renderWithRouter(<TaskList projectId="project-1" />);

		expect(
			await screen.findByRole("link", { name: /living room/i })
		).toBeDefined();
		expect(screen.queryByLabelText(/^title$/i)).toBeNull();

		await user.click(screen.getByRole("button", { name: /new room/i }));

		const dialog = await screen.findByRole("dialog", { name: /new room/i });
		expect(within(dialog).getByLabelText(/^title$/i)).toBeDefined();
		expect(
			within(dialog).getByRole("button", { name: /create room/i })
		).toBeDefined();
	});

	it("gives the room row link a visible design-system focus ring", async () => {
		renderWithRouter(<TaskList projectId="project-1" />);

		const link = await screen.findByRole("link", { name: /living room/i });
		expect(link.className).toContain("focus-visible:ring-[3px]");
		expect(link.className).toContain("focus-visible:ring-ring/50");
	});
});
