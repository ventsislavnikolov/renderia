import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	listItemsMock,
	createItemMock,
	deleteItemMock,
	setTaskFurnitureMock,
	getAuthHeadersMock,
	uploadMock,
	getSessionMock,
} = vi.hoisted(() => ({
	listItemsMock: vi.fn(),
	createItemMock: vi.fn(),
	deleteItemMock: vi.fn(),
	setTaskFurnitureMock: vi.fn(),
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
	setTaskFurniture: (...args: unknown[]) => setTaskFurnitureMock(...args),
}));

vi.mock("../../../../src/lib/supabase/browser", () => ({
	supabaseBrowser: {
		auth: { getSession: getSessionMock },
		storage: { from: vi.fn(() => ({ upload: uploadMock })) },
	},
}));

import { FurniturePicker } from "../../../../src/components/guided/furniture-picker";

const TASK_ID = "22222222-2222-2222-2222-222222222222";

function item(
	id: string,
	label: string,
	selected = false,
	metadata: Partial<{
		sourceLink: string | null;
		brand: string | null;
		price: number | null;
		currency: string | null;
		widthCm: number | null;
		heightCm: number | null;
		depthCm: number | null;
	}> = {}
) {
	return {
		id,
		label,
		source: "product" as const,
		originalName: `${label}.png`,
		signedUrl: `https://signed/${id}.png`,
		selected,
		createdAt: "2026-01-01T00:00:00Z",
		sourceLink: null,
		brand: null,
		price: null,
		currency: null,
		widthCm: null,
		heightCm: null,
		depthCm: null,
		...metadata,
	};
}

describe("FurniturePicker", () => {
	beforeEach(() => {
		listItemsMock.mockReset().mockResolvedValue({ items: [] });
		createItemMock.mockReset();
		deleteItemMock.mockReset().mockResolvedValue(undefined);
		setTaskFurnitureMock.mockReset().mockResolvedValue({ ok: true });
	});

	it("lists the account's furniture library and reports the persisted selection", async () => {
		listItemsMock.mockResolvedValue({
			items: [item("f1", "dresser"), item("f2", "sofa", true)],
		});
		const onSelectionChange = vi.fn();
		render(
			<FurniturePicker onSelectionChange={onSelectionChange} taskId={TASK_ID} />
		);

		expect(await screen.findByText("dresser")).toBeInTheDocument();
		expect(screen.getByText("sofa")).toBeInTheDocument();
		expect(onSelectionChange).toHaveBeenCalledWith(["f2"]);
		expect(listItemsMock).toHaveBeenCalledWith(
			expect.objectContaining({
				data: { taskId: TASK_ID },
			})
		);
	});

	it("shows import metadata and a source link on picker rows", async () => {
		listItemsMock.mockResolvedValue({
			items: [
				item("f1", "BILLY bookcase", false, {
					sourceLink: "https://www.ikea.com/p/billy",
					brand: "IKEA",
					price: 79.99,
					currency: "EUR",
					widthCm: 80,
					heightCm: 202,
					depthCm: 28,
				}),
			],
		});
		render(<FurniturePicker onSelectionChange={vi.fn()} taskId={TASK_ID} />);

		expect(await screen.findByText("IKEA")).toBeInTheDocument();
		expect(screen.getByText("W 80 × H 202 × D 28 cm")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: /source link/i })).toHaveAttribute(
			"href",
			"https://www.ikea.com/p/billy"
		);
	});

	it("persists selection changes when toggling an item", async () => {
		const user = userEvent.setup();
		listItemsMock.mockResolvedValue({
			items: [item("f1", "dresser"), item("f2", "sofa", true)],
		});
		const onSelectionChange = vi.fn();
		render(
			<FurniturePicker onSelectionChange={onSelectionChange} taskId={TASK_ID} />
		);

		const checkboxes = await screen.findAllByRole("checkbox", {
			name: /Include/i,
		});
		await user.click(checkboxes[0] as HTMLElement);
		await waitFor(() => {
			expect(setTaskFurnitureMock).toHaveBeenCalledWith(
				expect.objectContaining({
					data: { taskId: TASK_ID, furnitureItemIds: ["f2", "f1"] },
				})
			);
		});
		expect(onSelectionChange).toHaveBeenLastCalledWith(["f2", "f1"]);
	});

	it("deletes an item and drops it from the reported selection", async () => {
		const user = userEvent.setup();
		listItemsMock.mockResolvedValue({
			items: [item("f1", "dresser", true)],
		});
		const onSelectionChange = vi.fn();
		render(
			<FurniturePicker onSelectionChange={onSelectionChange} taskId={TASK_ID} />
		);

		await user.click(await screen.findByRole("button", { name: /Delete/i }));
		await waitFor(() => {
			expect(deleteItemMock).toHaveBeenCalledWith(
				expect.objectContaining({
					data: { furnitureItemId: "f1" },
				})
			);
		});
		expect(onSelectionChange).toHaveBeenLastCalledWith([]);
		expect(screen.queryByText("dresser")).not.toBeInTheDocument();
	});

	it("shows the labeling form after choosing a file and saves with a label", async () => {
		const user = userEvent.setup();
		listItemsMock.mockResolvedValue({ items: [] });
		createItemMock.mockResolvedValue({ id: "f-new" });
		render(<FurniturePicker onSelectionChange={vi.fn()} taskId={TASK_ID} />);
		await screen.findByText(/No furniture in your library yet/i);

		const file = new File(["bytes"], "dresser photo.png", {
			type: "image/png",
		});
		const input = screen.getByLabelText(/Add furniture image/i);
		await user.upload(input, file);

		const labelInput = await screen.findByLabelText(/What is this piece/i);
		const saveButton = screen.getByRole("button", { name: /Save furniture/i });
		expect(saveButton).toBeDisabled();
		await user.type(labelInput, "white dresser");
		await user.click(saveButton);

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
	});

	it("rejects unsupported file types with a HEIC hint", async () => {
		// applyAccept off: browsers still allow non-matching files via
		// drag-and-drop, which is exactly the path this error guards.
		const user = userEvent.setup({ applyAccept: false });
		listItemsMock.mockResolvedValue({ items: [] });
		render(<FurniturePicker onSelectionChange={vi.fn()} taskId={TASK_ID} />);
		await screen.findByText(/No furniture in your library yet/i);

		const file = new File(["bytes"], "IMG_9196.HEIC", { type: "image/heic" });
		const input = screen.getByLabelText(/Add furniture image/i);
		await user.upload(input, file);

		expect(await screen.findByRole("alert")).toHaveTextContent(/HEIC/i);
	});
});
