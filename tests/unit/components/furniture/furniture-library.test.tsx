import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	listItemsMock,
	createItemMock,
	deleteItemMock,
	getAuthHeadersMock,
	uploadMock,
	getSessionMock,
} = vi.hoisted(() => ({
	listItemsMock: vi.fn(),
	createItemMock: vi.fn(),
	deleteItemMock: vi.fn(),
	getAuthHeadersMock: vi.fn(() => Promise.resolve({})),
	uploadMock: vi.fn(() => Promise.resolve({ data: {}, error: null })),
	getSessionMock: vi.fn(() =>
		Promise.resolve({
			data: { session: { user: { id: "user-1" } } },
		})
	),
}));

vi.mock("../../../../src/lib/server-client/auth-headers", () => ({
	UNAUTHENTICATED_ERROR: "UNAUTHENTICATED",
	getAuthHeaders: getAuthHeadersMock,
}));

vi.mock("../../../../src/server/furniture", () => ({
	createFurnitureItem: (...args: unknown[]) => createItemMock(...args),
	deleteFurnitureItem: (...args: unknown[]) => deleteItemMock(...args),
	listFurnitureItems: (...args: unknown[]) => listItemsMock(...args),
}));

vi.mock("../../../../src/lib/supabase/browser", () => ({
	supabaseBrowser: {
		auth: { getSession: getSessionMock },
		storage: { from: vi.fn(() => ({ upload: uploadMock })) },
	},
}));

import { FurnitureLibrary } from "../../../../src/components/furniture/furniture-library";

function item(id: string, label: string) {
	return {
		id,
		label,
		source: "product" as const,
		originalName: `${label}.png`,
		signedUrl: `https://signed/${id}.png`,
		selected: false,
		createdAt: "2026-01-01T00:00:00Z",
	};
}

describe("FurnitureLibrary", () => {
	beforeEach(() => {
		listItemsMock.mockReset().mockResolvedValue({ items: [] });
		createItemMock.mockReset();
		deleteItemMock.mockReset().mockResolvedValue(undefined);
	});

	it("renders the account's furniture as a grid of cards", async () => {
		listItemsMock.mockResolvedValue({
			items: [item("f1", "white dresser"), item("f2", "green sofa")],
		});
		render(<FurnitureLibrary />);

		expect(await screen.findByText("white dresser")).toBeInTheDocument();
		expect(screen.getByText("green sofa")).toBeInTheDocument();
		expect(screen.getByAltText("white dresser")).toHaveAttribute(
			"src",
			"https://signed/f1.png"
		);
		expect(listItemsMock).toHaveBeenCalledWith(
			expect.objectContaining({ data: {} })
		);
	});

	it("shows an empty state inviting the first add", async () => {
		listItemsMock.mockResolvedValue({ items: [] });
		render(<FurnitureLibrary />);

		expect(
			await screen.findByText(/No furniture in your library yet/i)
		).toBeInTheDocument();
	});

	it("shows an error state when the library fails to load", async () => {
		listItemsMock.mockRejectedValue(new Error("Storage unavailable"));
		render(<FurnitureLibrary />);

		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Storage unavailable"
		);
	});

	it("deletes an item after confirmation", async () => {
		const user = userEvent.setup();
		listItemsMock.mockResolvedValue({ items: [item("f1", "white dresser")] });
		render(<FurnitureLibrary />);

		await user.click(
			await screen.findByRole("button", { name: /Delete white dresser/i })
		);
		await user.click(
			await screen.findByRole("button", { name: /^Delete furniture$/i })
		);

		await waitFor(() => {
			expect(deleteItemMock).toHaveBeenCalledWith(
				expect.objectContaining({ data: { furnitureItemId: "f1" } })
			);
		});
		expect(screen.queryByText("white dresser")).not.toBeInTheDocument();
	});

	it("keeps the item when the confirmation is cancelled", async () => {
		const user = userEvent.setup();
		listItemsMock.mockResolvedValue({ items: [item("f1", "white dresser")] });
		render(<FurnitureLibrary />);

		await user.click(
			await screen.findByRole("button", { name: /Delete white dresser/i })
		);
		await user.click(await screen.findByRole("button", { name: /^Cancel$/i }));

		expect(deleteItemMock).not.toHaveBeenCalled();
		expect(screen.getByText("white dresser")).toBeInTheDocument();
	});

	it("adds a furniture item and shows it without a reload", async () => {
		const user = userEvent.setup();
		listItemsMock
			.mockResolvedValueOnce({ items: [] })
			.mockResolvedValue({ items: [item("f-new", "white dresser")] });
		createItemMock.mockResolvedValue({ id: "f-new" });
		render(<FurnitureLibrary />);
		await screen.findByText(/No furniture in your library yet/i);

		const file = new File(["bytes"], "dresser.png", { type: "image/png" });
		await user.upload(screen.getByLabelText(/Add furniture image/i), file);
		await user.type(
			await screen.findByLabelText(/What is this piece/i),
			"white dresser"
		);
		await user.click(screen.getByRole("button", { name: /Save furniture/i }));

		await waitFor(() => {
			expect(uploadMock).toHaveBeenCalled();
			expect(createItemMock).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({
						label: "white dresser",
						source: "product",
						contentType: "image/png",
					}),
				})
			);
		});
		expect(await screen.findByText("white dresser")).toBeInTheDocument();
	});
});
