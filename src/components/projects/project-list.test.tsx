import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// `Link` needs a router context we don't want to stand up here — render it as
// a plain anchor so the create dialog can be exercised in isolation.
vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		...props
	}: {
		children?: React.ReactNode;
		[key: string]: unknown;
	}) => <a {...props}>{children}</a>,
}));

vi.mock("../../lib/server-client/auth-headers", () => ({
	getAuthHeaders: () => Promise.resolve({}),
	UNAUTHENTICATED_ERROR: "UNAUTHENTICATED",
}));

vi.mock("../../server/projects", () => ({
	createProject: () => Promise.resolve(),
}));

const useWorkspace = vi.fn();
vi.mock("../../lib/workspace-context", () => ({
	useWorkspace: () => useWorkspace(),
}));

import { ProjectList } from "./project-list";

describe("ProjectList create-dialog focus management", () => {
	beforeEach(() => {
		useWorkspace.mockReturnValue({
			projects: [],
			loadError: null,
			refreshProjects: vi.fn().mockResolvedValue(undefined),
		});
	});

	it("moves focus into the dialog on open and restores it to the trigger on Escape", async () => {
		const user = userEvent.setup();
		render(<ProjectList />);

		const trigger = screen.getByRole("button", { name: "New project" });
		await user.click(trigger);

		// Dialog is open and focus has left the trigger for the dialog.
		const dialog = await screen.findByRole("dialog");
		expect(dialog).toBeInTheDocument();
		expect(trigger).not.toHaveFocus();
		expect(dialog.contains(document.activeElement)).toBe(true);

		// Escape closes the dialog and focus returns to the control that opened it.
		await user.keyboard("{Escape}");
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		expect(trigger).toHaveFocus();
	});

	it("restores focus to the trigger when closed via the Cancel button", async () => {
		const user = userEvent.setup();
		render(<ProjectList />);

		const trigger = screen.getByRole("button", { name: "New project" });
		await user.click(trigger);

		await screen.findByRole("dialog");
		await user.click(screen.getByRole("button", { name: "Cancel" }));

		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		expect(trigger).toHaveFocus();
	});
});
