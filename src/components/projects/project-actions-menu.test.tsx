import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const updateProject = vi.fn();
const deleteProject = vi.fn();
vi.mock("../../server/projects", () => ({
	updateProject: (...args: unknown[]) => updateProject(...args),
	deleteProject: (...args: unknown[]) => deleteProject(...args),
}));

vi.mock("../../lib/server-client/auth-headers", () => ({
	getAuthHeaders: () => Promise.resolve({}),
	UNAUTHENTICATED_ERROR: "UNAUTHENTICATED",
}));

const track = vi.fn();
vi.mock("../../lib/analytics/track", () => ({
	track: (...a: unknown[]) => track(...a),
}));

const refreshProjects = vi.fn().mockResolvedValue(undefined);
const useWorkspace = vi.fn();
vi.mock("../../lib/workspace-context", () => ({
	useWorkspace: () => useWorkspace(),
}));

import { ProjectActionsMenu } from "./project-actions-menu";

const project = {
	id: "p1",
	owner_id: "user-1",
	name: "City house",
	description: "Top-floor flat",
	created_at: "",
	updated_at: "",
};

// Radix menus rely on pointer-capture + scrollIntoView, which jsdom doesn't
// implement. Stub them so the dropdown opens under test.
beforeAll(() => {
	Element.prototype.hasPointerCapture = () => false;
	Element.prototype.setPointerCapture = () => undefined;
	Element.prototype.releasePointerCapture = () => undefined;
	Element.prototype.scrollIntoView = () => undefined;
});

describe("ProjectActionsMenu", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		refreshProjects.mockResolvedValue(undefined);
		useWorkspace.mockReturnValue({
			refreshProjects,
			tasksMap: { p1: [{ id: "t1" }, { id: "t2" }] },
		});
	});

	it("edits a project from a prefilled dialog and reports completion", async () => {
		const user = userEvent.setup();
		updateProject.mockResolvedValue({});
		const onActionComplete = vi.fn();
		render(
			<ProjectActionsMenu
				onActionComplete={onActionComplete}
				project={project}
			/>
		);

		await user.click(screen.getByRole("button", { name: /actions for/i }));
		await user.click(await screen.findByRole("menuitem", { name: "Edit" }));

		const nameField = await screen.findByLabelText("Name");
		expect(nameField).toHaveValue("City house");

		await user.clear(nameField);
		await user.type(nameField, "Lake cabin");
		await user.click(screen.getByRole("button", { name: "Save changes" }));

		await waitFor(() => expect(updateProject).toHaveBeenCalledTimes(1));
		expect(updateProject).toHaveBeenCalledWith({
			data: {
				projectId: "p1",
				name: "Lake cabin",
				description: "Top-floor flat",
			},
			headers: {},
		});
		expect(track).toHaveBeenCalledWith("project_updated");
		expect(refreshProjects).toHaveBeenCalled();
		expect(onActionComplete).toHaveBeenCalledWith("Project updated.");
	});

	it("confirms deletion with the project name and room count, then fires onDeleted", async () => {
		const user = userEvent.setup();
		deleteProject.mockResolvedValue({ projectId: "p1" });
		const onDeleted = vi.fn();
		const onActionComplete = vi.fn();
		render(
			<ProjectActionsMenu
				onActionComplete={onActionComplete}
				onDeleted={onDeleted}
				project={project}
			/>
		);

		await user.click(screen.getByRole("button", { name: /actions for/i }));
		await user.click(await screen.findByRole("menuitem", { name: "Delete" }));

		const dialog = await screen.findByRole("dialog");
		expect(dialog).toHaveTextContent("Delete “City house”?");
		expect(dialog).toHaveTextContent("its 2 rooms");

		await user.click(screen.getByRole("button", { name: "Delete project" }));

		await waitFor(() => expect(deleteProject).toHaveBeenCalledTimes(1));
		expect(deleteProject).toHaveBeenCalledWith({
			data: { projectId: "p1" },
			headers: {},
		});
		expect(track).toHaveBeenCalledWith("project_deleted");
		expect(onActionComplete).toHaveBeenCalledWith("Deleted “City house”.");
		expect(onDeleted).toHaveBeenCalled();
	});
});
