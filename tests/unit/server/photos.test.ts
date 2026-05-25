import { describe, expect, it, vi } from "vitest";

import {
	__createPhotoRecordHandler,
	__listProjectPhotosHandler,
} from "../../../src/server/photos";

type Row = Record<string, unknown>;

function buildSupabaseStub(opts: {
	listResult?: { data: Row[] | null; error: unknown };
	singleResult?: { data: Row | null; error: unknown };
}) {
	const fromMock = vi.fn();
	const chain: Record<string, (...args: unknown[]) => unknown> = {};
	chain.select = vi.fn(() => chain);
	chain.eq = vi.fn(() => chain);
	chain.order = vi.fn(() =>
		Promise.resolve(opts.listResult ?? { data: [], error: null }),
	);
	chain.single = vi.fn(() =>
		Promise.resolve(opts.singleResult ?? { data: null, error: null }),
	);
	chain.insert = vi.fn(() => chain);
	fromMock.mockReturnValue(chain);
	return {
		supabase: { from: fromMock } as unknown as Parameters<
			typeof __listProjectPhotosHandler
		>[0]["supabase"],
		fromMock,
		chain,
	};
}

describe("listProjectPhotosHandler", () => {
	it("returns photo rows filtered by project and owner", async () => {
		const photos = [{ id: "ph-1", project_id: "p1" }];
		const { supabase, chain, fromMock } = buildSupabaseStub({
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
		expect(chain.eq).toHaveBeenCalledWith("owner_id", "user-1");
		expect(chain.eq).toHaveBeenCalledWith("project_id", "p1");
	});

	it("propagates supabase errors", async () => {
		const { supabase } = buildSupabaseStub({
			listResult: { data: null, error: { message: "broken" } },
		});

		await expect(
			__listProjectPhotosHandler({
				userId: "user-1",
				supabase,
				input: { projectId: "p1" },
			}),
		).rejects.toThrow("broken");
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
		const { supabase, chain, fromMock } = buildSupabaseStub({
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
		expect(chain.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				owner_id: "user-1",
				project_id: "p1",
				storage_path: "user-1/photo.png",
				original_name: "photo.png",
				content_type: "image/png",
			}),
		);
	});

	it("propagates insert errors", async () => {
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
		).rejects.toThrow("constraint");
	});
});
