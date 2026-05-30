import { describe, expect, it, vi } from "vitest";

import {
	__createPhotoRecordHandler,
	__listProjectPhotosHandler,
} from "../../../src/server/photos";

type Row = Record<string, unknown>;

/**
 * Build a PostgREST query stub keyed by table name.
 *
 * `tasksResult` controls what `.from("renovation_tasks").select().eq().eq().eq().maybeSingle()`
 * returns — used by the task-ownership pre-check in
 * `__createPhotoRecordHandler`. Default is an owned project so existing
 * happy-path tests keep working.
 */
function buildSupabaseStub(opts: {
	listResult?: { data: Row[] | null; error: unknown };
	singleResult?: { data: Row | null; error: unknown };
	tasksResult?: { data: Row | null; error: unknown };
	taskPhotoInsertResult?: { data: Row | null; error: unknown };
}) {
	const fromMock = vi.fn();
	const photosChain: Record<string, (...args: unknown[]) => unknown> = {};
	photosChain.select = vi.fn(() => photosChain);
	photosChain.eq = vi.fn(() => photosChain);
	photosChain.order = vi.fn(() =>
		Promise.resolve(opts.listResult ?? { data: [], error: null })
	);
	photosChain.single = vi.fn(() =>
		Promise.resolve(opts.singleResult ?? { data: null, error: null })
	);
	photosChain.insert = vi.fn(() => photosChain);

	const tasksChain: Record<string, (...args: unknown[]) => unknown> = {};
	tasksChain.select = vi.fn(() => tasksChain);
	tasksChain.eq = vi.fn(() => tasksChain);
	tasksChain.maybeSingle = vi.fn(() =>
		Promise.resolve(opts.tasksResult ?? { data: { id: "t1" }, error: null })
	);

	const taskPhotosChain: Record<string, (...args: unknown[]) => unknown> = {};
	taskPhotosChain.select = vi.fn(() => taskPhotosChain);
	taskPhotosChain.eq = vi.fn(() => taskPhotosChain);
	taskPhotosChain.then = vi.fn((resolve, reject) =>
		Promise.resolve(opts.listResult ?? { data: [], error: null }).then(
			resolve,
			reject
		)
	);
	taskPhotosChain.insert = vi.fn(() =>
		Promise.resolve(opts.taskPhotoInsertResult ?? { data: null, error: null })
	);

	fromMock.mockImplementation((table: string) => {
		if (table === "renovation_tasks") return tasksChain;
		if (table === "task_photos") return taskPhotosChain;
		return photosChain;
	});
	return {
		supabase: { from: fromMock } as unknown as Parameters<
			typeof __listProjectPhotosHandler
		>[0]["supabase"],
		fromMock,
		photosChain,
		tasksChain,
		taskPhotosChain,
	};
}

describe("listProjectPhotosHandler", () => {
	it("returns photo rows filtered by project, task, and owner", async () => {
		const photos = [{ id: "ph-1", project_id: "p1" }];
		const { supabase, taskPhotosChain, fromMock } = buildSupabaseStub({
			listResult: { data: [{ photos: photos[0] }], error: null },
		});

		const result = await __listProjectPhotosHandler({
			userId: "user-1",
			supabase,
			input: { projectId: "p1", taskId: "t1" },
		});

		expect(result).toEqual(photos);
		expect(fromMock).toHaveBeenCalledWith("task_photos");
		expect(taskPhotosChain.select).toHaveBeenCalledWith("photos(*)");
		// owner_id, project_id, and task_id were filtered — defense in depth
		// alongside RLS and prevents one room from showing another room's photo.
		expect(taskPhotosChain.eq).toHaveBeenCalledWith("owner_id", "user-1");
		expect(taskPhotosChain.eq).toHaveBeenCalledWith("project_id", "p1");
		expect(taskPhotosChain.eq).toHaveBeenCalledWith("task_id", "t1");
	});

	it("wraps supabase errors instead of leaking raw messages", async () => {
		const { supabase } = buildSupabaseStub({
			listResult: { data: null, error: { message: "broken" } },
		});

		await expect(
			__listProjectPhotosHandler({
				userId: "user-1",
				supabase,
				input: { projectId: "p1", taskId: "t1" },
			})
		).rejects.toThrow("Database error");
	});
});

describe("createPhotoRecordHandler", () => {
	it("inserts a row with the owner id forced from the auth context", async () => {
		const created = {
			id: "ph-1",
			owner_id: "user-1",
			project_id: "p1",
			storage_path: "user-1/photo.png",
		};
		const { supabase, photosChain, tasksChain, taskPhotosChain, fromMock } =
			buildSupabaseStub({
				singleResult: { data: created, error: null },
			});

		const result = await __createPhotoRecordHandler({
			userId: "user-1",
			supabase,
			input: {
				projectId: "p1",
				taskId: "t1",
				storagePath: "user-1/photo.png",
				originalName: "photo.png",
				contentType: "image/png",
			},
		});

		expect(result).toEqual(created);
		expect(fromMock).toHaveBeenCalledWith("renovation_tasks");
		expect(tasksChain.eq).toHaveBeenCalledWith("id", "t1");
		expect(tasksChain.eq).toHaveBeenCalledWith("project_id", "p1");
		expect(tasksChain.eq).toHaveBeenCalledWith("owner_id", "user-1");
		expect(fromMock).toHaveBeenCalledWith("photos");
		// insert was called with an owner_id derived from the authed user, never
		// from the caller-provided payload.
		expect(photosChain.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				owner_id: "user-1",
				project_id: "p1",
				storage_path: "user-1/photo.png",
				original_name: "photo.png",
				content_type: "image/png",
			})
		);
		expect(fromMock).toHaveBeenCalledWith("task_photos");
		expect(taskPhotosChain.insert).toHaveBeenCalledWith({
			owner_id: "user-1",
			project_id: "p1",
			task_id: "t1",
			photo_id: "ph-1",
		});
	});

	it("rejects with 'Task not found' when parent task is not owned by user", async () => {
		const { supabase, photosChain } = buildSupabaseStub({
			tasksResult: { data: null, error: null },
		});

		await expect(
			__createPhotoRecordHandler({
				userId: "user-1",
				supabase,
				input: {
					projectId: "p1",
					taskId: "t1",
					storagePath: "user-1/photo.png",
					originalName: "photo.png",
					contentType: "image/png",
				},
			})
		).rejects.toThrow("Task not found");
		expect(photosChain.insert).not.toHaveBeenCalled();
	});

	it("wraps insert errors", async () => {
		const { supabase } = buildSupabaseStub({
			singleResult: { data: null, error: { message: "constraint" } },
		});

		await expect(
			__createPhotoRecordHandler({
				userId: "user-1",
				supabase,
				input: {
					projectId: "p1",
					taskId: "t1",
					storagePath: "user-1/x.png",
					originalName: "x.png",
					contentType: "image/png",
				},
			})
		).rejects.toThrow("Database error");
	});

	it("wraps task photo link insert errors", async () => {
		const { supabase } = buildSupabaseStub({
			singleResult: {
				data: {
					id: "ph-1",
					owner_id: "user-1",
					project_id: "p1",
					storage_path: "user-1/photo.png",
				},
				error: null,
			},
			taskPhotoInsertResult: { data: null, error: { message: "link failed" } },
		});

		await expect(
			__createPhotoRecordHandler({
				userId: "user-1",
				supabase,
				input: {
					projectId: "p1",
					taskId: "t1",
					storagePath: "user-1/x.png",
					originalName: "x.png",
					contentType: "image/png",
				},
			})
		).rejects.toThrow("Database error");
	});
});
