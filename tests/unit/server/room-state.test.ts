import { describe, expect, it, vi } from "vitest";
import type { RenovationAiProvider } from "../../../src/lib/ai/types";
import {
	__approveStructuralPreviewHandler,
	__generateStructuralPreviewHandler,
	__loadTaskRoomStateHandler,
	__saveTaskRoomStateHandler,
} from "../../../src/server/room-state";

type Row = Record<string, unknown>;

function buildProvider(): RenovationAiProvider & {
	generateRenovationImages: ReturnType<typeof vi.fn>;
} {
	return {
		suggestTasks: vi.fn().mockResolvedValue({ value: [] }),
		detectProtectedElements: vi.fn().mockResolvedValue({ value: [] }),
		createDesignBrief: vi
			.fn()
			.mockResolvedValue({ value: { markdown: "# brief", prompt: "prompt" } }),
		generateRenovationImages: vi.fn().mockResolvedValue({
			value: [{ base64: "AAAA", contentType: "image/png" as const }],
		}),
	} as unknown as RenovationAiProvider & {
		generateRenovationImages: ReturnType<typeof vi.fn>;
	};
}

function buildSupabaseStub(opts?: {
	taskResult?: { data: Row | null; error: unknown };
	roomSetResult?: { data: Row | null; error: unknown };
	taskPhotosResult?: { data: Row[] | null; error: unknown };
	appearancesResult?: { data: Row[] | null; error: unknown };
	objectsResult?: { data: Row[] | null; error: unknown };
	previewResult?: { data: Row[] | null; error: unknown };
	roomSetInsertResult?: { data: Row | null; error: unknown };
	previewInsertResult?: { data: Row | null; error: unknown };
	updateResult?: { data: Row | null; error: unknown };
}) {
	const fromMock = vi.fn();

	const tasksChain: Record<string, (...args: unknown[]) => unknown> = {};
	tasksChain.select = vi.fn(() => tasksChain);
	tasksChain.eq = vi.fn(() => tasksChain);
	tasksChain.maybeSingle = vi.fn(() =>
		Promise.resolve(
			opts?.taskResult ?? {
				data: { id: "task-1", project_id: "project-1" },
				error: null,
			}
		)
	);

	const roomSetSelectChain: Record<string, (...args: unknown[]) => unknown> =
		{};
	roomSetSelectChain.select = vi.fn(() => roomSetSelectChain);
	roomSetSelectChain.eq = vi.fn(() => roomSetSelectChain);
	roomSetSelectChain.maybeSingle = vi.fn(() =>
		Promise.resolve(
			opts?.roomSetResult ?? {
				data: {
					task_id: "task-1",
					reference_photo_id: "photo-2",
					preview_approved: true,
					active_preview_id: "preview-1",
				},
				error: null,
			}
		)
	);

	const roomSetUpsertChain: Record<string, (...args: unknown[]) => unknown> =
		{};
	roomSetUpsertChain.select = vi.fn(() => roomSetUpsertChain);
	roomSetUpsertChain.single = vi.fn(() =>
		Promise.resolve(
			opts?.roomSetInsertResult ?? {
				data: { task_id: "task-1" },
				error: null,
			}
		)
	);

	const roomSetUpdateChain: Record<string, (...args: unknown[]) => unknown> =
		{};
	roomSetUpdateChain.eq = vi.fn(() => roomSetUpdateChain);
	roomSetUpdateChain.select = vi.fn(() => roomSetUpdateChain);
	roomSetUpdateChain.maybeSingle = vi.fn(() =>
		Promise.resolve(
			opts?.updateResult ?? { data: { id: "preview-1" }, error: null }
		)
	);

	const roomSetChain: Record<string, (...args: unknown[]) => unknown> = {};
	roomSetChain.select = vi.fn(() => roomSetSelectChain);
	roomSetChain.upsert = vi.fn(() => roomSetUpsertChain);
	roomSetChain.update = vi.fn(() => roomSetUpdateChain);

	const taskPhotosSelectChain: Record<string, (...args: unknown[]) => unknown> =
		{};
	taskPhotosSelectChain.select = vi.fn(() => taskPhotosSelectChain);
	taskPhotosSelectChain.eq = vi.fn(() => taskPhotosSelectChain);
	taskPhotosSelectChain.order = vi.fn(() =>
		Promise.resolve(
			opts?.taskPhotosResult ?? {
				data: [
					{
						photo_id: "photo-1",
						display_order: 0,
						reviewed_at: "2026-01-01T00:00:00Z",
					},
					{
						photo_id: "photo-2",
						display_order: 1,
						reviewed_at: null,
					},
				],
				error: null,
			}
		)
	);
	taskPhotosSelectChain.delete = vi.fn(() => taskPhotosSelectChain);

	const taskPhotosUpsertChain: Record<string, (...args: unknown[]) => unknown> =
		{};
	taskPhotosUpsertChain.select = vi.fn(() => taskPhotosUpsertChain);
	taskPhotosUpsertChain.then = undefined as unknown as never;
	const taskPhotosChain: Record<string, (...args: unknown[]) => unknown> = {};
	taskPhotosChain.select = vi.fn(() => taskPhotosSelectChain);
	taskPhotosChain.delete = vi.fn(() => taskPhotosSelectChain);
	taskPhotosChain.eq = vi.fn(() => taskPhotosChain);
	taskPhotosChain.upsert = vi.fn(() => Promise.resolve({ error: null }));

	const appearancesSelectChain: Record<
		string,
		(...args: unknown[]) => unknown
	> = {};
	appearancesSelectChain.select = vi.fn(() => appearancesSelectChain);
	appearancesSelectChain.eq = vi.fn(() => appearancesSelectChain);
	appearancesSelectChain.order = vi.fn(() =>
		Promise.resolve(
			opts?.appearancesResult ?? {
				data: [
					{
						id: "appearance-1",
						photo_id: "photo-1",
						label: "main door",
						kind: "door",
						x: 0.1,
						y: 0.2,
						width: 0.2,
						height: 0.3,
						confidence: 0.9,
						source: "ai",
						room_object_id: "object-1",
					},
				],
				error: null,
			}
		)
	);
	const appearancesChain: Record<string, (...args: unknown[]) => unknown> = {};
	appearancesChain.select = vi.fn(() => appearancesSelectChain);
	appearancesChain.delete = vi.fn(() => appearancesChain);
	appearancesChain.eq = vi.fn(() => appearancesChain);
	appearancesChain.insert = vi.fn(() => Promise.resolve({ error: null }));

	const objectsSelectChain: Record<string, (...args: unknown[]) => unknown> =
		{};
	objectsSelectChain.select = vi.fn(() => objectsSelectChain);
	objectsSelectChain.eq = vi.fn(() => objectsSelectChain);
	objectsSelectChain.order = vi.fn(() =>
		Promise.resolve(
			opts?.objectsResult ?? {
				data: [
					{
						id: "object-1",
						label: "main door",
						kind: "door",
						preservation_mode: "keep_type_restyle",
						is_persisted: true,
					},
				],
				error: null,
			}
		)
	);
	const objectsChain: Record<string, (...args: unknown[]) => unknown> = {};
	objectsChain.select = vi.fn(() => objectsSelectChain);
	objectsChain.delete = vi.fn(() => objectsChain);
	objectsChain.eq = vi.fn(() => objectsChain);
	objectsChain.insert = vi.fn(() => Promise.resolve({ error: null }));

	const previewSelectChain: Record<string, (...args: unknown[]) => unknown> =
		{};
	previewSelectChain.select = vi.fn(() => previewSelectChain);
	previewSelectChain.eq = vi.fn(() => previewSelectChain);
	previewSelectChain.order = vi.fn(() =>
		Promise.resolve(
			opts?.previewResult ?? {
				data: [
					{
						id: "preview-1",
						storage_bucket: "structural-previews",
						storage_path: "user-1/preview-1.png",
						status: "approved",
						reference_photo_id: "photo-2",
					},
				],
				error: null,
			}
		)
	);
	const previewInsertChain: Record<string, (...args: unknown[]) => unknown> =
		{};
	previewInsertChain.select = vi.fn(() => previewInsertChain);
	previewInsertChain.single = vi.fn(() =>
		Promise.resolve(
			opts?.previewInsertResult ?? {
				data: {
					id: "preview-2",
					storage_bucket: "structural-previews",
					storage_path: "user-1/preview-2.png",
					status: "generated",
					reference_photo_id: "photo-2",
				},
				error: null,
			}
		)
	);
	const previewUpdateChain: Record<string, (...args: unknown[]) => unknown> =
		{};
	previewUpdateChain.eq = vi.fn(() => previewUpdateChain);
	previewUpdateChain.select = vi.fn(() => previewUpdateChain);
	previewUpdateChain.maybeSingle = vi.fn(() =>
		Promise.resolve(
			opts?.updateResult ?? { data: { id: "preview-2" }, error: null }
		)
	);
	const previewsChain: Record<string, (...args: unknown[]) => unknown> = {};
	previewsChain.select = vi.fn(() => previewSelectChain);
	previewsChain.insert = vi.fn(() => previewInsertChain);
	previewsChain.update = vi.fn(() => previewUpdateChain);

	fromMock.mockImplementation((table: string) => {
		if (table === "renovation_tasks") return tasksChain;
		if (table === "task_room_sets") return roomSetChain;
		if (table === "task_photos") return taskPhotosChain;
		if (table === "room_object_appearances") return appearancesChain;
		if (table === "room_objects") return objectsChain;
		if (table === "structural_previews") return previewsChain;
		if (table === "photos") {
			const photosChain: Record<string, (...args: unknown[]) => unknown> = {};
			photosChain.select = vi.fn(() => photosChain);
			photosChain.eq = vi.fn(() => photosChain);
			photosChain.maybeSingle = vi.fn(() =>
				Promise.resolve({
					data: {
						storage_bucket: "source-photos",
						storage_path: "user-1/source.png",
						content_type: "image/png",
						original_name: "source.png",
					},
					error: null,
				})
			);
			return photosChain;
		}
		throw new Error(`Unhandled table ${table}`);
	});

	const uploadMock = vi.fn(() => Promise.resolve({ error: null }));
	const createSignedUrlMock = vi.fn((path: string) =>
		Promise.resolve({
			data: { signedUrl: `https://signed/${path}` },
			error: null,
		})
	);
	const downloadMock = vi.fn(() =>
		Promise.resolve({
			data: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
			error: null,
		})
	);
	const storageFromMock = vi.fn(() => ({
		upload: uploadMock,
		createSignedUrl: createSignedUrlMock,
		download: downloadMock,
	}));

	return {
		supabase: {
			from: fromMock,
			storage: { from: storageFromMock },
		} as unknown as Parameters<
			typeof __loadTaskRoomStateHandler
		>[0]["supabase"],
		fromMock,
		taskPhotosChain,
		appearancesChain,
		objectsChain,
		previewsChain,
		roomSetChain,
		uploadMock,
		createSignedUrlMock,
	};
}

describe("room-state server handlers", () => {
	it("loads the persisted room state, task photos, objects, appearances, and latest preview per angle", async () => {
		const stub = buildSupabaseStub();

		const result = await __loadTaskRoomStateHandler({
			userId: "user-1",
			supabase: stub.supabase,
			input: { taskId: "task-1" },
		});

		expect(result.roomState.photoIds).toStrictEqual(["photo-1", "photo-2"]);
		expect(result.roomState.reviewedPhotoIds).toStrictEqual(["photo-1"]);
		expect(result.roomState.referencePhotoId).toBe("photo-2");
		expect(result.roomState.previewApproved).toBe(true);
		expect(result.roomState.objects).toHaveLength(1);
		expect(result.previews["photo-2"]?.signedUrl).toContain("preview-1.png");
		expect(result.previews["photo-2"]?.referencePhotoId).toBe("photo-2");
	});

	it("keeps only the newest preview per reference photo angle", async () => {
		const stub = buildSupabaseStub({
			previewResult: {
				data: [
					{
						id: "preview-3",
						storage_bucket: "structural-previews",
						storage_path: "user-1/preview-3.png",
						status: "generated",
						reference_photo_id: "photo-1",
					},
					{
						id: "preview-2",
						storage_bucket: "structural-previews",
						storage_path: "user-1/preview-2.png",
						status: "superseded",
						reference_photo_id: "photo-1",
					},
					{
						id: "preview-1",
						storage_bucket: "structural-previews",
						storage_path: "user-1/preview-1.png",
						status: "approved",
						reference_photo_id: "photo-2",
					},
				],
				error: null,
			},
		});

		const result = await __loadTaskRoomStateHandler({
			userId: "user-1",
			supabase: stub.supabase,
			input: { taskId: "task-1" },
		});

		expect(Object.keys(result.previews)).toHaveLength(2);
		expect(result.previews["photo-1"]?.id).toBe("preview-3");
		expect(result.previews["photo-2"]?.id).toBe("preview-1");
	});

	it("saves the task room state by replacing task photo metadata, appearances, and objects", async () => {
		const stub = buildSupabaseStub();

		await __saveTaskRoomStateHandler({
			userId: "user-1",
			supabase: stub.supabase,
			input: {
				taskId: "task-1",
				roomState: {
					photoIds: ["photo-1", "photo-2"],
					reviewedPhotoIds: ["photo-1"],
					referencePhotoId: "photo-2",
					previewApproved: false,
					appearances: [
						{
							id: "appearance-1",
							photoId: "photo-1",
							label: "main door",
							kind: "door",
							x: 0.1,
							y: 0.2,
							width: 0.2,
							height: 0.3,
							confidence: 0.9,
							source: "ai",
							objectId: "object-1",
						},
					],
					objects: [
						{
							id: "object-1",
							label: "main door",
							kind: "door",
							preservationMode: "keep_type_restyle",
							appearanceIds: ["appearance-1"],
							isPersisted: true,
						},
					],
				},
			},
		});

		expect(stub.roomSetChain.upsert).toHaveBeenCalled();
		expect(stub.previewsChain.update).toHaveBeenCalled();
		expect(stub.taskPhotosChain.delete).toHaveBeenCalled();
		expect(stub.appearancesChain.insert).toHaveBeenCalled();
		expect(stub.objectsChain.insert).toHaveBeenCalled();
	});

	it("preserves the active preview link when saving an approved room snapshot", async () => {
		const stub = buildSupabaseStub();

		await __saveTaskRoomStateHandler({
			userId: "user-1",
			supabase: stub.supabase,
			input: {
				taskId: "task-1",
				roomState: {
					photoIds: ["photo-1"],
					reviewedPhotoIds: ["photo-1"],
					referencePhotoId: "photo-1",
					previewApproved: true,
					appearances: [],
					objects: [],
				},
			},
		});

		expect(stub.roomSetChain.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				preview_approved: true,
				active_preview_id: "preview-1",
			})
		);
	});

	it("generates a dedicated structural preview artifact and persists it separately", async () => {
		const stub = buildSupabaseStub();
		const provider = buildProvider();

		const result = await __generateStructuralPreviewHandler({
			userId: "user-1",
			supabase: stub.supabase,
			provider,
			input: {
				taskId: "task-1",
				taskTitle: "Bedroom refresh",
				referencePhotoId: "photo-2",
				roomState: {
					photoIds: ["photo-1", "photo-2"],
					reviewedPhotoIds: ["photo-1", "photo-2"],
					referencePhotoId: "photo-2",
					previewApproved: false,
					appearances: [],
					objects: [
						{
							id: "object-1",
							label: "main door",
							kind: "door",
							preservationMode: "keep_type_restyle",
							appearanceIds: [],
							isPersisted: true,
						},
					],
				},
			},
		});

		expect(provider.generateRenovationImages).toHaveBeenCalledWith({
			sourceImage: expect.any(Object),
			prompts: [expect.stringContaining("STRUCTURAL PREVIEW OBJECTIVE")],
		});
		expect(stub.uploadMock).toHaveBeenCalledWith(
			expect.stringContaining("user-1/task-1/"),
			expect.anything(),
			expect.objectContaining({ contentType: "image/png", upsert: false })
		);
		expect(result.preview.id).toBe("preview-2");
		expect(result.preview.signedUrl).toContain("preview-2");
	});

	it("approves a structural preview and marks it active on the task room set", async () => {
		const stub = buildSupabaseStub();

		await __approveStructuralPreviewHandler({
			userId: "user-1",
			supabase: stub.supabase,
			input: { taskId: "task-1", previewId: "preview-2" },
		});

		expect(stub.previewsChain.update).toHaveBeenCalled();
		expect(stub.roomSetChain.update).toHaveBeenCalled();
	});
});
