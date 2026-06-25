import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const updateTask = vi.fn();
const deleteTask = vi.fn();
vi.mock("../../server/tasks", () => ({
	updateTask: (...args: unknown[]) => updateTask(...args),
	deleteTask: (...args: unknown[]) => deleteTask(...args),
}));

vi.mock("../../lib/server-client/auth-headers", () => ({
	getAuthHeaders: () => Promise.resolve({}),
	UNAUTHENTICATED_ERROR: "UNAUTHENTICATED",
}));

const refreshProjects = vi.fn().mockResolvedValue(undefined);
const useWorkspace = vi.fn();
vi.mock("../../lib/workspace-context", () => ({
	useWorkspace: () => useWorkspace(),
}));

import { RoomActionsMenu } from "./task-actions-menu";

const task = {
	id: "t1",
	owner_id: "user-1",
	project_id: "p1",
	title: "Living room",
	category: "living room",
	status: "active" as const,
	notes: "south-facing",
	style: "scandinavian",
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

describe("RoomActionsMenu", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		refreshProjects.mockResolvedValue(undefined);
		useWorkspace.mockReturnValue({ refreshProjects });
	});

	it("edits a room from a prefilled dialog, refreshes, and reports completion", async () => {
		const user = userEvent.setup();
		updateTask.mockResolvedValue({});
		const onActionComplete = vi.fn();
		const onMutated = vi.fn().mockResolvedValue(undefined);
		render(
			<RoomActionsMenu
				onActionComplete={onActionComplete}
				onMutated={onMutated}
				task={task}
			/>
		);

		await user.click(screen.getByRole("button", { name: /actions for/i }));
		await user.click(await screen.findByRole("menuitem", { name: "Edit" }));

		const titleField = await screen.findByLabelText("Title");
		expect(titleField).toHaveValue("Living room");

		await user.clear(titleField);
		await user.type(titleField, "Master bedroom");
		await user.click(screen.getByRole("button", { name: "Save changes" }));

		await waitFor(() => expect(updateTask).toHaveBeenCalledTimes(1));
		expect(updateTask).toHaveBeenCalledWith({
			data: {
				taskId: "t1",
				title: "Master bedroom",
				category: "living room",
				notes: "south-facing",
			},
			headers: {},
		});
		expect(refreshProjects).toHaveBeenCalled();
		expect(onMutated).toHaveBeenCalled();
		expect(onActionComplete).toHaveBeenCalledWith("Room updated.");
	});

	it("confirms deletion with the room name, then fires onDeleted", async () => {
		const user = userEvent.setup();
		deleteTask.mockResolvedValue({ taskId: "t1" });
		const onDeleted = vi.fn();
		const onActionComplete = vi.fn();
		render(
			<RoomActionsMenu
				onActionComplete={onActionComplete}
				onDeleted={onDeleted}
				task={task}
			/>
		);

		await user.click(screen.getByRole("button", { name: /actions for/i }));
		await user.click(await screen.findByRole("menuitem", { name: "Delete" }));

		const dialog = await screen.findByRole("dialog");
		expect(dialog).toHaveTextContent("Delete “Living room”?");

		await user.click(screen.getByRole("button", { name: "Delete room" }));

		await waitFor(() => expect(deleteTask).toHaveBeenCalledTimes(1));
		expect(deleteTask).toHaveBeenCalledWith({
			data: { taskId: "t1" },
			headers: {},
		});
		expect(refreshProjects).toHaveBeenCalled();
		expect(onActionComplete).toHaveBeenCalledWith("Deleted “Living room”.");
		expect(onDeleted).toHaveBeenCalled();
	});
});
