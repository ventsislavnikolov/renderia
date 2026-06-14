import { describe, expect, it, vi } from "vitest";

import {
	__addFurniturePhotoHandler,
	__createFurnitureItemHandler,
	__deleteFurnitureItemHandler,
	__deleteFurniturePhotoHandler,
	__listFurnitureItemsHandler,
	__setActiveFurniturePhotoHandler,
	__setTaskFurnitureHandler,
	__updateFurnitureItemHandler,
} from "../../../src/server/furniture";

type Row = Record<string, unknown>;

/**
 * PostgREST + storage stub keyed by table name, mirroring the photos server
 * test style. Each chain resolves with the configured result; storage
 * `createSignedUrl`/`remove` are plain mocks the assertions can inspect.
 */
function buildSupabaseStub(opts: {
	tasksResult?: { data: Row | null; error: unknown };
	itemsListResult?: { data: Row[] | null; error: unknown };
	itemSingleResult?: { data: Row | null; error: unknown };
	linksResult?: { data: Row[] | null; error: unknown };
	insertResult?: { data: Row | null; error: unknown };
	/** Active/owned furniture_item_images rows resolved by select chains. */
	imagesResult?: { data: Row[] | null; error: unknown };
	imageInsertResult?: { data: Row | null; error: unknown };
	/** Single furniture_item_images row resolved by `.maybeSingle()`. */
	imageSingleResult?: { data: Row | null; error: unknown };
}) {
	const tasksChain: Record<string, (...args: unknown[]) => unknown> = {};
	tasksChain.select = vi.fn(() => tasksChain);
	tasksChain.eq = vi.fn(() => tasksChain);
	tasksChain.maybeSingle = vi.fn(() =>
		Promise.resolve(
			opts.tasksResult ?? {
				data: { id: "t1", project_id: "p1" },
				error: null,
			}
		)
	);

	const itemsChain: Record<string, (...args: unknown[]) => unknown> = {};
	itemsChain.select = vi.fn(() => itemsChain);
	itemsChain.eq = vi.fn(() => itemsChain);
	itemsChain.order = vi.fn(() =>
		Promise.resolve(opts.itemsListResult ?? { data: [], error: null })
	);
	itemsChain.maybeSingle = vi.fn(() =>
		Promise.resolve(opts.itemSingleResult ?? { data: null, error: null })
	);
	itemsChain.single = vi.fn(() =>
		Promise.resolve(opts.insertResult ?? { data: null, error: null })
	);
	itemsChain.insert = vi.fn(() => itemsChain);
	itemsChain.update = vi.fn(() => itemsChain);
	itemsChain.delete = vi.fn(() => itemsChain);
	itemsChain.then = vi.fn((resolve, reject) =>
		Promise.resolve({ data: null, error: null }).then(resolve, reject)
	);

	// furniture_item_images: insert is awaited directly (create/add); select
	// chains are awaited after their `.eq()` filters (list active photos, count,
	// delete cleanup) or terminate in `.order()`/`.maybeSingle()`; update/delete
	// chains are awaited after their filters (set-active, delete-photo).
	const imagesChain: Record<string, (...args: unknown[]) => unknown> = {};
	imagesChain.select = vi.fn(() => imagesChain);
	imagesChain.eq = vi.fn(() => imagesChain);
	imagesChain.order = vi.fn(() =>
		Promise.resolve(opts.imagesResult ?? { data: [], error: null })
	);
	imagesChain.maybeSingle = vi.fn(() =>
		Promise.resolve(opts.imageSingleResult ?? { data: null, error: null })
	);
	imagesChain.insert = vi.fn(() =>
		Promise.resolve(opts.imageInsertResult ?? { data: null, error: null })
	);
	imagesChain.update = vi.fn(() => imagesChain);
	imagesChain.delete = vi.fn(() => imagesChain);
	imagesChain.then = vi.fn((resolve, reject) =>
		Promise.resolve(opts.imagesResult ?? { data: [], error: null }).then(
			resolve,
			reject
		)
	);

	const linksChain: Record<string, (...args: unknown[]) => unknown> = {};
	linksChain.select = vi.fn(() => linksChain);
	linksChain.eq = vi.fn(() => linksChain);
	linksChain.delete = vi.fn(() => linksChain);
	linksChain.insert = vi.fn(() => Promise.resolve({ data: null, error: null }));
	linksChain.then = vi.fn((resolve, reject) =>
		Promise.resolve(opts.linksResult ?? { data: [], error: null }).then(
			resolve,
			reject
		)
	);

	const createSignedUrl = vi.fn(() =>
		Promise.resolve({ data: { signedUrl: "https://signed/url" }, error: null })
	);
	const remove = vi.fn(() => Promise.resolve({ data: null, error: null }));

	const fromMock = vi.fn((table: string) => {
		if (table === "renovation_tasks") return tasksChain;
		if (table === "task_furniture") return linksChain;
		if (table === "furniture_item_images") return imagesChain;
		return itemsChain;
	});

	return {
		supabase: {
			from: fromMock,
			storage: { from: vi.fn(() => ({ createSignedUrl, remove })) },
		} as unknown as Parameters<
			typeof __listFurnitureItemsHandler
		>[0]["supabase"],
		fromMock,
		tasksChain,
		itemsChain,
		imagesChain,
		linksChain,
		createSignedUrl,
		remove,
	};
}

describe("createFurnitureItemHandler", () => {
	it("inserts the parent metadata row plus an active Reference Image child row", async () => {
		const created = { id: "f1", label: "white dresser" };
		const { supabase, fromMock, itemsChain, imagesChain } = buildSupabaseStub({
			insertResult: { data: created, error: null },
		});

		const result = await __createFurnitureItemHandler({
			userId: "user-1",
			supabase,
			input: {
				storagePath: "user-1/dresser.png",
				originalName: "dresser.png",
				contentType: "image/png",
				label: "white dresser",
				source: "product",
			},
		});

		expect(result).toEqual(created);
		expect(fromMock).not.toHaveBeenCalledWith("projects");
		// Parent keeps identity + metadata; image fields move to the child table.
		expect(itemsChain.insert).toHaveBeenCalledWith({
			owner_id: "user-1",
			label: "white dresser",
			source_link: null,
			brand: null,
			price: null,
			currency: null,
			width_cm: null,
			height_cm: null,
			depth_cm: null,
		});
		expect(imagesChain.insert).toHaveBeenCalledWith({
			furniture_item_id: "f1",
			owner_id: "user-1",
			storage_path: "user-1/dresser.png",
			original_name: "dresser.png",
			content_type: "image/png",
			source: "product",
			is_active: true,
		});
	});

	it("round-trips Link-Import metadata into the parent and image rows", async () => {
		const created = { id: "f9", label: "BILLY bookcase" };
		const { supabase, itemsChain, imagesChain } = buildSupabaseStub({
			insertResult: { data: created, error: null },
		});

		await __createFurnitureItemHandler({
			userId: "user-1",
			supabase,
			input: {
				storagePath: "user-1/billy.png",
				originalName: "billy.png",
				contentType: "image/png",
				label: "BILLY bookcase",
				source: "product",
				sourceLink: "https://www.ikea.com/p/billy",
				brand: "IKEA",
				price: 79.99,
				currency: "EUR",
				widthCm: 80,
				heightCm: 202,
				depthCm: 28,
			},
		});

		expect(itemsChain.insert).toHaveBeenCalledWith({
			owner_id: "user-1",
			label: "BILLY bookcase",
			source_link: "https://www.ikea.com/p/billy",
			brand: "IKEA",
			price: 79.99,
			currency: "EUR",
			width_cm: 80,
			height_cm: 202,
			depth_cm: 28,
		});
		expect(imagesChain.insert).toHaveBeenCalledWith({
			furniture_item_id: "f9",
			owner_id: "user-1",
			storage_path: "user-1/billy.png",
			original_name: "billy.png",
			content_type: "image/png",
			source: "product",
			is_active: true,
		});
	});
});

describe("listFurnitureItemsHandler", () => {
	it("returns every item the user owns, resolving the Reference Image from the active child photo", async () => {
		const { supabase, itemsChain } = buildSupabaseStub({
			itemsListResult: {
				data: [
					{
						id: "f1",
						label: "dresser",
						created_at: "2026-01-01T00:00:00Z",
					},
					{
						id: "f2",
						label: "sofa",
						created_at: "2026-01-02T00:00:00Z",
					},
				],
				error: null,
			},
			imagesResult: {
				data: [
					{
						id: "img-f1",
						furniture_item_id: "f1",
						source: "product",
						original_name: "dresser.png",
						storage_bucket: "furniture-references",
						storage_path: "user-1/dresser.png",
						is_active: true,
						created_at: "2026-01-01T00:00:00Z",
					},
					{
						id: "img-f2",
						furniture_item_id: "f2",
						source: "photo",
						original_name: "sofa.png",
						storage_bucket: "furniture-references",
						storage_path: "user-1/sofa.png",
						is_active: true,
						created_at: "2026-01-02T00:00:00Z",
					},
				],
				error: null,
			},
			linksResult: { data: [{ furniture_item_id: "f2" }], error: null },
		});

		const result = await __listFurnitureItemsHandler({
			userId: "user-1",
			supabase,
			input: { taskId: "t1" },
		});

		expect(result.items).toHaveLength(2);
		expect(result.items[0]).toMatchObject({
			id: "f1",
			source: "product",
			originalName: "dresser.png",
			selected: false,
			signedUrl: "https://signed/url",
		});
		expect(result.items[1]).toMatchObject({
			id: "f2",
			source: "photo",
			selected: true,
		});
		// Account-wide library: the only filter on the items query is ownership.
		expect(itemsChain.eq).toHaveBeenCalledTimes(1);
		expect(itemsChain.eq).toHaveBeenCalledWith("owner_id", "user-1");
	});

	it("returns every photo of an item, active first then by created_at", async () => {
		const { supabase } = buildSupabaseStub({
			itemsListResult: {
				data: [
					{ id: "f1", label: "dresser", created_at: "2026-01-01T00:00:00Z" },
				],
				error: null,
			},
			imagesResult: {
				data: [
					{
						id: "img-old",
						furniture_item_id: "f1",
						source: "product",
						original_name: "front.png",
						storage_bucket: "furniture-references",
						storage_path: "user-1/front.png",
						is_active: false,
						created_at: "2026-01-01T00:00:00Z",
					},
					{
						id: "img-active",
						furniture_item_id: "f1",
						source: "photo",
						original_name: "side.png",
						storage_bucket: "furniture-references",
						storage_path: "user-1/side.png",
						is_active: true,
						created_at: "2026-01-02T00:00:00Z",
					},
					{
						id: "img-new",
						furniture_item_id: "f1",
						source: "photo",
						original_name: "back.png",
						storage_bucket: "furniture-references",
						storage_path: "user-1/back.png",
						is_active: false,
						created_at: "2026-01-03T00:00:00Z",
					},
				],
				error: null,
			},
		});

		const result = await __listFurnitureItemsHandler({
			userId: "user-1",
			supabase,
			input: {},
		});

		const item = result.items[0];
		// Active first; the rest keep created_at-ascending order.
		expect(item.photos.map((photo) => photo.id)).toEqual([
			"img-active",
			"img-old",
			"img-new",
		]);
		expect(item.photos.filter((photo) => photo.isActive)).toHaveLength(1);
		// Top-level Reference Image fields mirror the active photo.
		expect(item.originalName).toBe("side.png");
		expect(item.source).toBe("photo");
	});

	it("maps metadata columns and tolerates absent/null ones", async () => {
		const { supabase } = buildSupabaseStub({
			itemsListResult: {
				data: [
					{
						id: "f1",
						label: "BILLY bookcase",
						created_at: "2026-01-01T00:00:00Z",
						source_link: "https://www.ikea.com/p/billy",
						brand: "IKEA",
						// numeric columns can arrive as strings from PostgREST.
						price: "79.99",
						currency: "EUR",
						width_cm: "80",
						height_cm: "202",
						depth_cm: null,
					},
					{
						id: "f2",
						label: "hand-added chair",
						created_at: "2026-01-02T00:00:00Z",
					},
				],
				error: null,
			},
			imagesResult: {
				data: [
					{
						id: "img-f1",
						furniture_item_id: "f1",
						source: "product",
						original_name: "billy.png",
						storage_bucket: "furniture-references",
						storage_path: "user-1/billy.png",
						is_active: true,
						created_at: "2026-01-01T00:00:00Z",
					},
					{
						id: "img-f2",
						furniture_item_id: "f2",
						source: "photo",
						original_name: "chair.png",
						storage_bucket: "furniture-references",
						storage_path: "user-1/chair.png",
						is_active: true,
						created_at: "2026-01-02T00:00:00Z",
					},
				],
				error: null,
			},
		});

		const result = await __listFurnitureItemsHandler({
			userId: "user-1",
			supabase,
			input: {},
		});

		expect(result.items[0]).toMatchObject({
			sourceLink: "https://www.ikea.com/p/billy",
			brand: "IKEA",
			price: 79.99,
			currency: "EUR",
			widthCm: 80,
			heightCm: 202,
			depthCm: null,
		});
		expect(result.items[1]).toMatchObject({
			sourceLink: null,
			brand: null,
			price: null,
			currency: null,
			widthCm: null,
			heightCm: null,
			depthCm: null,
		});
	});
});

describe("updateFurnitureItemHandler", () => {
	it("updates label and dimensions scoped to the owner", async () => {
		const updated = { id: "f1", label: "tall bookcase" };
		const { supabase, itemsChain } = buildSupabaseStub({
			insertResult: { data: updated, error: null },
		});

		const result = await __updateFurnitureItemHandler({
			userId: "user-1",
			supabase,
			input: {
				furnitureItemId: "f1",
				label: "tall bookcase",
				widthCm: 80,
				heightCm: 202,
				depthCm: null,
			},
		});

		expect(result).toEqual(updated);
		expect(itemsChain.update).toHaveBeenCalledWith({
			label: "tall bookcase",
			width_cm: 80,
			height_cm: 202,
			depth_cm: null,
		});
		expect(itemsChain.eq).toHaveBeenCalledWith("id", "f1");
		expect(itemsChain.eq).toHaveBeenCalledWith("owner_id", "user-1");
	});

	it("rejects when the item is not owned", async () => {
		const { supabase } = buildSupabaseStub({
			insertResult: { data: null, error: null },
		});

		await expect(
			__updateFurnitureItemHandler({
				userId: "user-1",
				supabase,
				input: {
					furnitureItemId: "missing",
					label: "x",
					widthCm: null,
					heightCm: null,
					depthCm: null,
				},
			})
		).rejects.toThrow("Furniture item not found");
	});
});

describe("deleteFurnitureItemHandler", () => {
	it("deletes the row then removes every Furniture Photo's storage object", async () => {
		const { supabase, itemsChain, remove } = buildSupabaseStub({
			itemSingleResult: { data: { id: "f1" }, error: null },
			imagesResult: {
				data: [
					{
						storage_bucket: "furniture-references",
						storage_path: "user-1/dresser.png",
					},
					{
						storage_bucket: "furniture-references",
						storage_path: "user-1/dresser-side.png",
					},
				],
				error: null,
			},
		});

		await __deleteFurnitureItemHandler({
			userId: "user-1",
			supabase,
			input: { furnitureItemId: "f1" },
		});

		expect(itemsChain.delete).toHaveBeenCalled();
		expect(itemsChain.eq).not.toHaveBeenCalledWith(
			"project_id",
			expect.anything()
		);
		expect(remove).toHaveBeenCalledWith([
			"user-1/dresser.png",
			"user-1/dresser-side.png",
		]);
	});

	it("rejects unknown items", async () => {
		const { supabase } = buildSupabaseStub({
			itemSingleResult: { data: null, error: null },
		});

		await expect(
			__deleteFurnitureItemHandler({
				userId: "user-1",
				supabase,
				input: { furnitureItemId: "missing" },
			})
		).rejects.toThrow("Furniture item not found");
	});
});

describe("setTaskFurnitureHandler", () => {
	it("replaces the task's selection with the provided ids", async () => {
		const { supabase, linksChain } = buildSupabaseStub({});

		await __setTaskFurnitureHandler({
			userId: "user-1",
			supabase,
			input: { taskId: "t1", furnitureItemIds: ["f1", "f2"] },
		});

		expect(linksChain.delete).toHaveBeenCalled();
		expect(linksChain.insert).toHaveBeenCalledWith([
			expect.objectContaining({
				owner_id: "user-1",
				project_id: "p1",
				task_id: "t1",
				furniture_item_id: "f1",
			}),
			expect.objectContaining({ furniture_item_id: "f2" }),
		]);
	});

	it("rejects when the task is not owned", async () => {
		const { supabase } = buildSupabaseStub({
			tasksResult: { data: null, error: null },
		});

		await expect(
			__setTaskFurnitureHandler({
				userId: "user-1",
				supabase,
				input: { taskId: "t1", furnitureItemIds: [] },
			})
		).rejects.toThrow("Task not found");
	});
});

describe("addFurniturePhotoHandler", () => {
	it("inserts a non-active Furniture Photo row on an owned item under the cap", async () => {
		const { supabase, imagesChain } = buildSupabaseStub({
			itemSingleResult: { data: { id: "f1" }, error: null },
			// Three existing photos — well under the cap of 6.
			imagesResult: {
				data: [{ id: "i1" }, { id: "i2" }, { id: "i3" }],
				error: null,
			},
		});

		await __addFurniturePhotoHandler({
			userId: "user-1",
			supabase,
			input: {
				furnitureItemId: "f1",
				storagePath: "user-1/extra.png",
				originalName: "extra.png",
				contentType: "image/png",
				source: "photo",
			},
		});

		// New photos never steal the active flag — the Reference Image stays put.
		expect(imagesChain.insert).toHaveBeenCalledWith({
			furniture_item_id: "f1",
			owner_id: "user-1",
			storage_path: "user-1/extra.png",
			original_name: "extra.png",
			content_type: "image/png",
			source: "photo",
			is_active: false,
		});
	});

	it("rejects a 7th photo (cap of 6)", async () => {
		const { supabase, imagesChain } = buildSupabaseStub({
			itemSingleResult: { data: { id: "f1" }, error: null },
			imagesResult: {
				data: [
					{ id: "i1" },
					{ id: "i2" },
					{ id: "i3" },
					{ id: "i4" },
					{ id: "i5" },
					{ id: "i6" },
				],
				error: null,
			},
		});

		await expect(
			__addFurniturePhotoHandler({
				userId: "user-1",
				supabase,
				input: {
					furnitureItemId: "f1",
					storagePath: "user-1/seventh.png",
					originalName: "seventh.png",
					contentType: "image/png",
					source: "photo",
				},
			})
		).rejects.toThrow(/maximum of 6/i);
		expect(imagesChain.insert).not.toHaveBeenCalled();
	});

	it("rejects when the item is not owned", async () => {
		const { supabase } = buildSupabaseStub({
			itemSingleResult: { data: null, error: null },
		});

		await expect(
			__addFurniturePhotoHandler({
				userId: "user-1",
				supabase,
				input: {
					furnitureItemId: "missing",
					storagePath: "user-1/extra.png",
					originalName: "extra.png",
					contentType: "image/png",
					source: "photo",
				},
			})
		).rejects.toThrow("Furniture item not found");
	});
});

describe("setActiveFurniturePhotoHandler", () => {
	it("clears the current active then sets the chosen photo active", async () => {
		const { supabase, imagesChain } = buildSupabaseStub({
			imageSingleResult: { data: { id: "i2" }, error: null },
		});

		await __setActiveFurniturePhotoHandler({
			userId: "user-1",
			supabase,
			input: { furnitureItemId: "f1", photoId: "i2" },
		});

		// Exactly one-active is the DB invariant; the handler clears the old
		// active first, then promotes the chosen photo — two updates, in order.
		expect(imagesChain.update).toHaveBeenCalledTimes(2);
		expect(imagesChain.update).toHaveBeenNthCalledWith(1, { is_active: false });
		expect(imagesChain.update).toHaveBeenNthCalledWith(2, { is_active: true });
	});

	it("rejects when the photo does not belong to the item", async () => {
		const { supabase, imagesChain } = buildSupabaseStub({
			imageSingleResult: { data: null, error: null },
		});

		await expect(
			__setActiveFurniturePhotoHandler({
				userId: "user-1",
				supabase,
				input: { furnitureItemId: "f1", photoId: "missing" },
			})
		).rejects.toThrow("Furniture photo not found");
		expect(imagesChain.update).not.toHaveBeenCalled();
	});
});

describe("deleteFurniturePhotoHandler", () => {
	it("rejects deleting the item's last photo", async () => {
		const { supabase, imagesChain, remove } = buildSupabaseStub({
			imageSingleResult: {
				data: {
					id: "i1",
					is_active: true,
					storage_bucket: "furniture-references",
					storage_path: "user-1/only.png",
				},
				error: null,
			},
			imagesResult: {
				data: [
					{ id: "i1", is_active: true, created_at: "2026-01-01T00:00:00Z" },
				],
				error: null,
			},
		});

		await expect(
			__deleteFurniturePhotoHandler({
				userId: "user-1",
				supabase,
				input: { furnitureItemId: "f1", photoId: "i1" },
			})
		).rejects.toThrow(/at least one photo/i);
		expect(imagesChain.delete).not.toHaveBeenCalled();
		expect(remove).not.toHaveBeenCalled();
	});

	it("deletes a non-active photo and removes its storage object without promoting", async () => {
		const { supabase, imagesChain, remove } = buildSupabaseStub({
			imageSingleResult: {
				data: {
					id: "i2",
					is_active: false,
					storage_bucket: "furniture-references",
					storage_path: "user-1/side.png",
				},
				error: null,
			},
			imagesResult: {
				data: [
					{ id: "i1", is_active: true, created_at: "2026-01-01T00:00:00Z" },
					{ id: "i2", is_active: false, created_at: "2026-01-02T00:00:00Z" },
				],
				error: null,
			},
		});

		await __deleteFurniturePhotoHandler({
			userId: "user-1",
			supabase,
			input: { furnitureItemId: "f1", photoId: "i2" },
		});

		expect(imagesChain.delete).toHaveBeenCalledTimes(1);
		// Deleting a non-active photo leaves the Reference Image untouched.
		expect(imagesChain.update).not.toHaveBeenCalled();
		expect(remove).toHaveBeenCalledWith(["user-1/side.png"]);
	});

	it("promotes the oldest remaining photo when the active one is deleted", async () => {
		const { supabase, imagesChain, remove } = buildSupabaseStub({
			imageSingleResult: {
				data: {
					id: "i1",
					is_active: true,
					storage_bucket: "furniture-references",
					storage_path: "user-1/front.png",
				},
				error: null,
			},
			// Ordered oldest-first; i1 (the active, deleted one) is removed and the
			// next-oldest survivor (i2) must inherit the active flag.
			imagesResult: {
				data: [
					{ id: "i1", is_active: true, created_at: "2026-01-01T00:00:00Z" },
					{ id: "i2", is_active: false, created_at: "2026-01-02T00:00:00Z" },
					{ id: "i3", is_active: false, created_at: "2026-01-03T00:00:00Z" },
				],
				error: null,
			},
		});

		await __deleteFurniturePhotoHandler({
			userId: "user-1",
			supabase,
			input: { furnitureItemId: "f1", photoId: "i1" },
		});

		expect(imagesChain.delete).toHaveBeenCalledTimes(1);
		expect(imagesChain.update).toHaveBeenCalledTimes(1);
		expect(imagesChain.update).toHaveBeenCalledWith({ is_active: true });
		// The promotion targets the oldest survivor by id.
		expect(imagesChain.eq).toHaveBeenCalledWith("id", "i2");
		expect(remove).toHaveBeenCalledWith(["user-1/front.png"]);
	});

	it("rejects when the photo does not belong to the item", async () => {
		const { supabase } = buildSupabaseStub({
			imageSingleResult: { data: null, error: null },
		});

		await expect(
			__deleteFurniturePhotoHandler({
				userId: "user-1",
				supabase,
				input: { furnitureItemId: "f1", photoId: "missing" },
			})
		).rejects.toThrow("Furniture photo not found");
	});
});
