import { describe, expect, it, vi } from "vitest";

import {
	__createPhotoRecordHandler,
	__listProjectPhotosHandler,
} from "../../../src/server/photos";

type Row = Record<string, unknown>;

/**
 * Build a PostgREST query stub keyed by table name.
 *
 * `projectsResult` controls what `.from("projects").select().eq().eq().maybeSingle()`
 * returns — used by the parent-ownership pre-check in
 * `__createPhotoRecordHandler`. Default is an owned project so existing
 * happy-path tests keep working.
 */
function buildSupabaseStub(opts: {
	listResult?: { data: Row[] | null; error: unknown };
	singleResult?: { data: Row | null; error: unknown };
	projectsResult?: { data: Row | null; error: unknown };
}) {
	const fromMock = vi.fn();
	const photosChain: Record<string, (...args: unknown[]) => unknown> = {};
	photosChain.select = vi.fn(() => photosChain);
	photosChain.eq = vi.fn(() => photosChain);
	photosChain.order = vi.fn(() =>
		Promise.resolve(opts.listResult ?? { data: [], error: null }),
	);
	photosChain.single = vi.fn(() =>
		Promise.resolve(opts.singleResult ?? { data: null, error: null }),
	);
	photosChain.insert = vi.fn(() => photosChain);

	const projectsChain: Record<string, (...args: unknown[]) => unknown> = {};
	projectsChain.select = vi.fn(() => projectsChain);
	projectsChain.eq = vi.fn(() => projectsChain);
	projectsChain.maybeSingle = vi.fn(() =>
		Promise.resolve(
			opts.projectsResult ?? { data: { id: "p1" }, error: null },
		),
	);

	fromMock.mockImplementation((table: string) =>
		table === "projects" ? projectsChain : photosChain,
	);
	return {
		supabase: { from: fromMock } as unknown as Parameters<
			typeof __listProjectPhotosHandler
		>[0]["supabase"],
		fromMock,
		photosChain,
		projectsChain,
	};
}

describe("listProjectPhotosHandler", () => {
	it("returns photo rows filtered by project and owner", async () => {
		const photos = [{ id: "ph-1", project_id: "p1" }];
		const { supabase, photosChain, fromMock } = buildSupabaseStub({
			listResult: { data: photos, error: null },
		});

		const result = await __listProjectPhotosHandler({
			userId: "user-1",
			supabase,
			input: { projectId: "p1" },
		});

		expect(result).toEqual(photos);
		expect(fromMock).toHaveBeenCalledWith("photos");
		// owner_id and project_id were filtered — defense in depth alongside RLS.
		expect(photosChain.eq).toHaveBeenCalledWith("owner_id", "user-1");
		expect(photosChain.eq).toHaveBeenCalledWith("project_id", "p1");
	});

	it("wraps supabase errors instead of leaking raw messages", async () => {
		const { supabase } = buildSupabaseStub({
			listResult: { data: null, error: { message: "broken" } },
		});

		await expect(
			__listProjectPhotosHandler({
				userId: "user-1",
				supabase,
				input: { projectId: "p1" },
			}),
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
		const { supabase, photosChain, fromMock } = buildSupabaseStub({
			singleResult: { data: created, error: null },
		});

		const result = await __createPhotoRecordHandler({
			userId: "user-1",
			supabase,
			input: {
				projectId: "p1",
				storagePath: "user-1/photo.png",
				originalName: "photo.png",
				contentType: "image/png",
			},
		});

		expect(result).toEqual(created);
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
			}),
		);
	});

	it("rejects with 'Project not found' when parent project is not owned by user", async () => {
		const { supabase, photosChain } = buildSupabaseStub({
			projectsResult: { data: null, error: null },
		});

		await expect(
			__createPhotoRecordHandler({
				userId: "user-1",
				supabase,
				input: {
					projectId: "p1",
					storagePath: "user-1/photo.png",
					originalName: "photo.png",
					contentType: "image/png",
				},
			}),
		).rejects.toThrow("Project not found");
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
					storagePath: "user-1/x.png",
					originalName: "x.png",
					contentType: "image/png",
				},
			}),
		).rejects.toThrow("Database error");
	});
});
