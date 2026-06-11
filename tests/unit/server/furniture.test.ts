import { describe, expect, it, vi } from "vitest";

import {
	__createFurnitureItemHandler,
	__deleteFurnitureItemHandler,
	__listFurnitureItemsHandler,
	__setTaskFurnitureHandler,
} from "../../../src/server/furniture";

type Row = Record<string, unknown>;

/**
 * PostgREST + storage stub keyed by table name, mirroring the photos server
 * test style. Each chain resolves with the configured result; storage
 * `createSignedUrl`/`remove` are plain mocks the assertions can inspect.
 */
function buildSupabaseStub(opts: {
	projectsResult?: { data: Row | null; error: unknown };
	tasksResult?: { data: Row | null; error: unknown };
	itemsListResult?: { data: Row[] | null; error: unknown };
	itemSingleResult?: { data: Row | null; error: unknown };
	linksResult?: { data: Row[] | null; error: unknown };
	insertResult?: { data: Row | null; error: unknown };
}) {
	const projectsChain: Record<string, (...args: unknown[]) => unknown> = {};
	projectsChain.select = vi.fn(() => projectsChain);
	projectsChain.eq = vi.fn(() => projectsChain);
	projectsChain.maybeSingle = vi.fn(() =>
		Promise.resolve(opts.projectsResult ?? { data: { id: "p1" }, error: null })
	);

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
	itemsChain.delete = vi.fn(() => itemsChain);
	itemsChain.then = vi.fn((resolve, reject) =>
		Promise.resolve({ data: null, error: null }).then(resolve, reject)
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
		if (table === "projects") return projectsChain;
		if (table === "renovation_tasks") return tasksChain;
		if (table === "task_furniture") return linksChain;
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
		projectsChain,
		tasksChain,
		itemsChain,
		linksChain,
		createSignedUrl,
		remove,
	};
}

describe("createFurnitureItemHandler", () => {
	it("verifies project ownership then inserts with the auth-derived owner", async () => {
		const created = { id: "f1", label: "white dresser" };
		const { supabase, itemsChain } = buildSupabaseStub({
			insertResult: { data: created, error: null },
		});

		const result = await __createFurnitureItemHandler({
			userId: "user-1",
			supabase,
			input: {
				projectId: "p1",
				storagePath: "user-1/dresser.png",
				originalName: "dresser.png",
				contentType: "image/png",
				label: "white dresser",
				source: "product",
			},
		});

		expect(result).toEqual(created);
		expect(itemsChain.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				owner_id: "user-1",
				project_id: "p1",
				label: "white dresser",
				source: "product",
			})
		);
	});

	it("rejects when the project is not owned", async () => {
		const { supabase } = buildSupabaseStub({
			projectsResult: { data: null, error: null },
		});

		await expect(
			__createFurnitureItemHandler({
				userId: "user-1",
				supabase,
				input: {
					projectId: "p1",
					storagePath: "user-1/dresser.png",
					originalName: "dresser.png",
					contentType: "image/png",
					label: "dresser",
					source: "product",
				},
			})
		).rejects.toThrow("Project not found");
	});
});

describe("listFurnitureItemsHandler", () => {
	it("returns items with signed URLs and per-task selection flags", async () => {
		const { supabase } = buildSupabaseStub({
			itemsListResult: {
				data: [
					{
						id: "f1",
						label: "dresser",
						source: "product",
						original_name: "dresser.png",
						storage_bucket: "furniture-references",
						storage_path: "user-1/dresser.png",
						created_at: "2026-01-01T00:00:00Z",
					},
					{
						id: "f2",
						label: "sofa",
						source: "photo",
						original_name: "sofa.png",
						storage_bucket: "furniture-references",
						storage_path: "user-1/sofa.png",
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
			input: { projectId: "p1", taskId: "t1" },
		});

		expect(result.items).toHaveLength(2);
		expect(result.items[0]).toMatchObject({
			id: "f1",
			selected: false,
			signedUrl: "https://signed/url",
		});
		expect(result.items[1]).toMatchObject({ id: "f2", selected: true });
	});
});

describe("deleteFurnitureItemHandler", () => {
	it("deletes the row then removes the storage object", async () => {
		const { supabase, itemsChain, remove } = buildSupabaseStub({
			itemSingleResult: {
				data: {
					storage_bucket: "furniture-references",
					storage_path: "user-1/dresser.png",
				},
				error: null,
			},
		});

		await __deleteFurnitureItemHandler({
			userId: "user-1",
			supabase,
			input: { projectId: "p1", furnitureItemId: "f1" },
		});

		expect(itemsChain.delete).toHaveBeenCalled();
		expect(remove).toHaveBeenCalledWith(["user-1/dresser.png"]);
	});

	it("rejects unknown items", async () => {
		const { supabase } = buildSupabaseStub({
			itemSingleResult: { data: null, error: null },
		});

		await expect(
			__deleteFurnitureItemHandler({
				userId: "user-1",
				supabase,
				input: { projectId: "p1", furnitureItemId: "missing" },
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
