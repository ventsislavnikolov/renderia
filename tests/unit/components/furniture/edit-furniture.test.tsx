import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	updateItemMock,
	setActiveMock,
	deletePhotoMock,
	addPhotoMock,
	listItemsMock,
	getAuthHeadersMock,
	uploadMock,
	getSessionMock,
} = vi.hoisted(() => ({
	updateItemMock: vi.fn(),
	setActiveMock: vi.fn(),
	deletePhotoMock: vi.fn(),
	addPhotoMock: vi.fn(),
	listItemsMock: vi.fn(),
	getAuthHeadersMock: vi.fn(() => Promise.resolve({})),
	uploadMock: vi.fn(() => Promise.resolve({ data: {}, error: null })),
	getSessionMock: vi.fn(() =>
		Promise.resolve({ data: { session: { user: { id: "user-1" } } } })
	),
}));

vi.mock("../../../../src/lib/server-client/auth-headers", () => ({
	UNAUTHENTICATED_ERROR: "UNAUTHENTICATED",
	getAuthHeaders: getAuthHeadersMock,
}));

vi.mock("../../../../src/server/furniture", () => ({
	updateFurnitureItem: (...args: unknown[]) => updateItemMock(...args),
	setActiveFurniturePhoto: (...args: unknown[]) => setActiveMock(...args),
	deleteFurniturePhoto: (...args: unknown[]) => deletePhotoMock(...args),
	addFurniturePhoto: (...args: unknown[]) => addPhotoMock(...args),
	listFurnitureItems: (...args: unknown[]) => listItemsMock(...args),
}));

vi.mock("../../../../src/lib/supabase/browser", () => ({
	supabaseBrowser: {
		auth: { getSession: getSessionMock },
		storage: { from: vi.fn(() => ({ upload: uploadMock })) },
	},
}));

import { EditFurniture } from "../../../../src/components/furniture/edit-furniture";

type Photo = {
	id: string;
	source: "product" | "photo";
	originalName: string;
	signedUrl: string | null;
	isActive: boolean;
	createdAt: string;
};

function photo(id: string, isActive: boolean, overrides: Partial<Photo> = {}) {
	return {
		id,
		source: "product" as const,
		originalName: `${id}.png`,
		signedUrl: `https://signed/${id}.png`,
		isActive,
		createdAt: "2026-01-01T00:00:00Z",
		...overrides,
	};
}

function item(photos: Photo[]) {
	return {
		id: "item-1",
		label: "White dresser",
		widthCm: 80,
		heightCm: 90,
		depthCm: 40,
		photos,
	};
}

describe("EditFurniture native inputs", () => {
	beforeEach(() => {
		listItemsMock.mockReset().mockResolvedValue({ items: [] });
	});

	it("gives the name and dimension inputs a visible design-system focus ring", async () => {
		render(
			<EditFurniture
				item={item([photo("p1", true)])}
				onClose={vi.fn()}
				onSaved={vi.fn()}
			/>
		);

		for (const name of [/^name$/i, /width/i, /height/i, /depth/i]) {
			const input = await screen.findByLabelText(name);
			expect(input.className).toContain("focus-visible:ring-[3px]");
			expect(input.className).toContain("focus-visible:ring-ring/50");
		}
	});
});

describe("EditFurniture photo gallery", () => {
	beforeEach(() => {
		updateItemMock.mockReset().mockResolvedValue({ id: "item-1" });
		setActiveMock.mockReset().mockResolvedValue({ ok: true });
		deletePhotoMock.mockReset().mockResolvedValue({ ok: true });
		addPhotoMock.mockReset().mockResolvedValue({ ok: true });
		listItemsMock.mockReset().mockResolvedValue({ items: [] });
	});

	it("renders every photo and badges the active one as the Reference Image", async () => {
		render(
			<EditFurniture
				item={item([photo("p1", true), photo("p2", false)])}
				onClose={vi.fn()}
				onSaved={vi.fn()}
			/>
		);

		expect(await screen.findByAltText("p1.png")).toBeInTheDocument();
		expect(screen.getByAltText("p2.png")).toBeInTheDocument();

		// The active photo carries the badge and is the pressed toggle.
		expect(screen.getByText("Reference Image")).toBeInTheDocument();
		const activeToggle = screen.getByRole("button", {
			name: /p1\.png \(Reference Image\)/i,
		});
		expect(activeToggle).toHaveAttribute("aria-pressed", "true");
		const inactiveToggle = screen.getByRole("button", {
			name: /Use p2\.png as the Reference Image/i,
		});
		expect(inactiveToggle).toHaveAttribute("aria-pressed", "false");
	});

	it("sets a photo active when its thumbnail is clicked", async () => {
		const user = userEvent.setup();
		const onPhotosChanged = vi.fn();
		render(
			<EditFurniture
				item={item([photo("p1", true), photo("p2", false)])}
				onClose={vi.fn()}
				onPhotosChanged={onPhotosChanged}
				onSaved={vi.fn()}
			/>
		);

		await user.click(
			await screen.findByRole("button", {
				name: /Use p2\.png as the Reference Image/i,
			})
		);

		await waitFor(() => {
			expect(setActiveMock).toHaveBeenCalledWith(
				expect.objectContaining({
					data: { furnitureItemId: "item-1", photoId: "p2" },
				})
			);
		});
		expect(onPhotosChanged).toHaveBeenCalled();
	});

	it("deletes a photo and disables delete on the last remaining one", async () => {
		const user = userEvent.setup();
		render(
			<EditFurniture
				item={item([photo("p1", true), photo("p2", false)])}
				onClose={vi.fn()}
				onSaved={vi.fn()}
			/>
		);

		await user.click(
			await screen.findByRole("button", { name: /Delete p2\.png/i })
		);

		await waitFor(() => {
			expect(deletePhotoMock).toHaveBeenCalledWith(
				expect.objectContaining({
					data: { furnitureItemId: "item-1", photoId: "p2" },
				})
			);
		});
	});

	it("disables the delete control when only one photo remains", async () => {
		render(
			<EditFurniture
				item={item([photo("p1", true)])}
				onClose={vi.fn()}
				onSaved={vi.fn()}
			/>
		);

		expect(
			await screen.findByRole("button", { name: /Delete p1\.png/i })
		).toBeDisabled();
		expect(screen.getByText(/keeps at least one photo/i)).toBeInTheDocument();
	});

	it("disables Add photo once the item has the maximum of six photos", async () => {
		const photos = [
			photo("p1", true),
			photo("p2", false),
			photo("p3", false),
			photo("p4", false),
			photo("p5", false),
			photo("p6", false),
		];
		render(
			<EditFurniture item={item(photos)} onClose={vi.fn()} onSaved={vi.fn()} />
		);

		expect(
			await screen.findByRole("button", { name: /^Add photo$/i })
		).toBeDisabled();
		expect(screen.getByText(/maximum of 6 photos/i)).toBeInTheDocument();
	});

	it("uploads and registers a new photo through the crop flow", async () => {
		const user = userEvent.setup();
		const onPhotosChanged = vi.fn();
		// After the add, the reload returns the item with the extra photo.
		listItemsMock.mockResolvedValue({
			items: [item([photo("p1", true), photo("p2", false)])],
		});
		render(
			<EditFurniture
				item={item([photo("p1", true)])}
				onClose={vi.fn()}
				onPhotosChanged={onPhotosChanged}
				onSaved={vi.fn()}
			/>
		);

		const file = new File(["bytes"], "extra.png", { type: "image/png" });
		await user.upload(await screen.findByLabelText(/Add photo/i), file);
		await user.click(
			await screen.findByRole("button", { name: /^Add photo$/i })
		);

		await waitFor(() => {
			expect(uploadMock).toHaveBeenCalled();
			expect(addPhotoMock).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({
						furnitureItemId: "item-1",
						contentType: "image/png",
						source: "product",
					}),
				})
			);
		});
		expect(listItemsMock).toHaveBeenCalled();
		expect(onPhotosChanged).toHaveBeenCalled();
	});

	it("still saves label and dimension edits", async () => {
		const user = userEvent.setup();
		const onSaved = vi.fn();
		render(
			<EditFurniture
				item={item([photo("p1", true)])}
				onClose={vi.fn()}
				onSaved={onSaved}
			/>
		);

		const nameField = await screen.findByLabelText(/^name$/i);
		await user.clear(nameField);
		await user.type(nameField, "Tall dresser");
		await user.click(screen.getByRole("button", { name: /Save changes/i }));

		await waitFor(() => {
			expect(updateItemMock).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({
						furnitureItemId: "item-1",
						label: "Tall dresser",
					}),
				})
			);
		});
		expect(onSaved).toHaveBeenCalled();
	});
});
