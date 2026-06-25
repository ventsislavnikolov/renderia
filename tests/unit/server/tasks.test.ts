import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RenovationAiProvider } from "../../../src/lib/ai/types";
import {
	__createTaskHandler,
	__deleteTaskHandler,
	__getTaskStyleHandler,
	__listProjectTasksHandler,
	__setTaskStyleHandler,
	__suggestTasksForProjectHandler,
	__updateTaskHandler,
} from "../../../src/server/tasks";

type Row = Record<string, unknown>;

/**
 * Build a PostgREST query stub keyed by table name.
 *
 * `projectsResult` controls what `.from("projects").select().eq().eq().maybeSingle()`
 * returns — used by the parent-ownership pre-check in `__createTaskHandler`.
 * Default is an owned project so existing happy-path tests keep working.
 *
 * `signedUrlResult` controls the `storage.from(bucket).createSignedUrl(path, ttl)`
 * stub used by the suggest-tasks handler. Default returns a deterministic
 * `https://signed/<path>` URL so tests can assert on the URL that reaches
 * the AI provider.
 */
function buildSupabaseStub(opts: {
	listResult?: { data: Row[] | null; error: unknown };
	photosResult?: { data: Row[] | null; error: unknown };
	singleResult?: { data: Row | null; error: unknown };
	projectsResult?: { data: Row | null; error: unknown };
	styleResult?: { data: Row | null; error: unknown };
	signedUrlResult?: {
		data: { signedUrl: string } | null;
		error: unknown;
	};
}) {
	const fromMock = vi.fn();
	const tasksChain: Record<string, (...args: unknown[]) => unknown> = {};
	tasksChain.select = vi.fn(() => tasksChain);
	tasksChain.eq = vi.fn(() => tasksChain);
	tasksChain.order = vi.fn(() =>
		Promise.resolve(opts.listResult ?? { data: [], error: null })
	);
	tasksChain.single = vi.fn(() =>
		Promise.resolve(opts.singleResult ?? { data: null, error: null })
	);
	tasksChain.insert = vi.fn(() => tasksChain);
	tasksChain.update = vi.fn(() => tasksChain);
	// getTaskStyle / setTaskStyle both resolve via .maybeSingle().
	tasksChain.maybeSingle = vi.fn(() =>
		Promise.resolve(
			opts.styleResult ?? { data: { style: "scandinavian" }, error: null }
		)
	);

	const photosChain: Record<string, (...args: unknown[]) => unknown> = {};
	photosChain.select = vi.fn(() => photosChain);
	photosChain.eq = vi.fn(() =>
		Object.assign(photosChain, {
			then: (resolve: (value: unknown) => unknown) =>
				resolve(opts.photosResult ?? { data: [], error: null }),
		})
	);

	const projectsChain: Record<string, (...args: unknown[]) => unknown> = {};
	projectsChain.select = vi.fn(() => projectsChain);
	projectsChain.eq = vi.fn(() => projectsChain);
	projectsChain.maybeSingle = vi.fn(() =>
		Promise.resolve(opts.projectsResult ?? { data: { id: "p1" }, error: null })
	);

	const createSignedUrlMock = vi.fn(
		async (path: string, _ttl: number) =>
			opts.signedUrlResult ?? {
				data: { signedUrl: `https://signed/${path}` },
				error: null,
			}
	);
	const storageFromMock = vi.fn(() => ({
		createSignedUrl: createSignedUrlMock,
	}));

	fromMock.mockImplementation((table: string) => {
		if (table === "photos") return photosChain;
		if (table === "projects") return projectsChain;
		return tasksChain;
	});
	return {
		supabase: {
			from: fromMock,
			storage: { from: storageFromMock },
		} as unknown as Parameters<typeof __listProjectTasksHandler>[0]["supabase"],
		fromMock,
		tasksChain,
		projectsChain,
		createSignedUrlMock,
		storageFromMock,
	};
}

const SAMPLE_DEBUG = {
	model: "gpt-5.5",
	prompt: "test prompt",
	rawResponse: "{}",
	durationMs: 7,
};

function buildMockProvider(): RenovationAiProvider & {
	suggestTasks: ReturnType<typeof vi.fn>;
} {
	const provider = {
		suggestTasks: vi.fn().mockResolvedValue({
			value: [{ title: "ceiling", category: "ceiling", rationale: "r" }],
			debug: SAMPLE_DEBUG,
		}),
		detectProtectedElements: vi.fn().mockResolvedValue({ value: [] }),
		createDesignBrief: vi
			.fn()
			.mockResolvedValue({ value: { markdown: "", prompt: "" } }),
		generateRenovationImages: vi.fn().mockResolvedValue({ value: [] }),
	};
	return provider as unknown as RenovationAiProvider & {
		suggestTasks: ReturnType<typeof vi.fn>;
	};
}

const originalNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
	process.env.NODE_ENV = "test";
});

afterEach(() => {
	process.env.NODE_ENV = originalNodeEnv;
});

describe("listProjectTasksHandler", () => {
	it("filters by project and owner", async () => {
		const tasks = [{ id: "t1", project_id: "p1" }];
		const { supabase, tasksChain } = buildSupabaseStub({
			listResult: { data: tasks, error: null },
		});

		const result = await __listProjectTasksHandler({
			userId: "user-1",
			supabase,
			input: { projectId: "p1" },
		});

		expect(result).toEqual(tasks);
		expect(tasksChain.eq).toHaveBeenCalledWith("owner_id", "user-1");
		expect(tasksChain.eq).toHaveBeenCalledWith("project_id", "p1");
	});

	it("wraps supabase errors instead of leaking raw messages", async () => {
		const { supabase } = buildSupabaseStub({
			listResult: { data: null, error: { code: "42501", message: "policy" } },
		});

		await expect(
			__listProjectTasksHandler({
				userId: "user-1",
				supabase,
				input: { projectId: "p1" },
			})
		).rejects.toThrow("Not authorized");
	});
});

describe("createTaskHandler", () => {
	it("inserts a task with status='active' and owner from auth context", async () => {
		const created = {
			id: "t1",
			owner_id: "user-1",
			project_id: "p1",
			title: "ceiling",
			category: "ceiling",
			status: "active",
		};
		const { supabase, tasksChain } = buildSupabaseStub({
			singleResult: { data: created, error: null },
		});

		const result = await __createTaskHandler({
			userId: "user-1",
			supabase,
			input: {
				projectId: "p1",
				title: "ceiling",
				category: "ceiling",
			},
		});

		expect(result).toEqual(created);
		expect(tasksChain.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				owner_id: "user-1",
				project_id: "p1",
				title: "ceiling",
				category: "ceiling",
				status: "active",
			})
		);
	});

	it("rejects with 'Project not found' when parent project is not owned by user", async () => {
		const { supabase, tasksChain } = buildSupabaseStub({
			projectsResult: { data: null, error: null },
		});

		await expect(
			__createTaskHandler({
				userId: "user-1",
				supabase,
				input: {
					projectId: "p1",
					title: "ceiling",
					category: "ceiling",
				},
			})
		).rejects.toThrow("Project not found");
		expect(tasksChain.insert).not.toHaveBeenCalled();
	});
});

describe("suggestTasksForProjectHandler", () => {
	it("loads project photos, mints signed URLs, and passes them to the AI provider", async () => {
		const photos = [
			{
				id: "ph-1",
				storage_bucket: "source-photos",
				storage_path: "user-1/p1.png",
				notes: "broken tile",
			},
			{
				id: "ph-2",
				storage_bucket: "source-photos",
				storage_path: "user-1/p2.png",
				notes: null,
			},
		];
		const { supabase, storageFromMock, createSignedUrlMock } =
			buildSupabaseStub({
				photosResult: { data: photos, error: null },
			});
		const provider = buildMockProvider();

		const result = await __suggestTasksForProjectHandler({
			userId: "user-1",
			supabase,
			provider,
			input: { projectId: "p1", projectNotes: "needs work" },
		});

		expect(result.data).toEqual([
			{ title: "ceiling", category: "ceiling", rationale: "r" },
		]);
		expect(result.debug).toEqual(SAMPLE_DEBUG);
		expect(storageFromMock).toHaveBeenCalledWith("source-photos");
		expect(createSignedUrlMock).toHaveBeenCalledTimes(2);
		expect(provider.suggestTasks).toHaveBeenCalledWith({
			projectNotes: "needs work",
			photos: [
				{
					id: "ph-1",
					signedUrl: "https://signed/user-1/p1.png",
					notes: "broken tile",
				},
				{ id: "ph-2", signedUrl: "https://signed/user-1/p2.png" },
			],
		});
	});

	it("strips the debug payload in production", async () => {
		process.env.NODE_ENV = "production";
		const photos = [
			{
				id: "ph-1",
				storage_bucket: "source-photos",
				storage_path: "user-1/p1.png",
				notes: null,
			},
		];
		const { supabase } = buildSupabaseStub({
			photosResult: { data: photos, error: null },
		});
		const provider = buildMockProvider();

		const result = await __suggestTasksForProjectHandler({
			userId: "user-1",
			supabase,
			provider,
			input: { projectId: "p1", projectNotes: "" },
		});

		expect(result.data).toEqual([
			{ title: "ceiling", category: "ceiling", rationale: "r" },
		]);
		expect("debug" in result).toBe(false);
	});

	it("wraps photo query errors before calling the provider", async () => {
		const { supabase } = buildSupabaseStub({
			photosResult: { data: null, error: { message: "no photos" } },
		});
		const provider = buildMockProvider();

		await expect(
			__suggestTasksForProjectHandler({
				userId: "user-1",
				supabase,
				provider,
				input: { projectId: "p1", projectNotes: "" },
			})
		).rejects.toThrow("Database error");
		expect(provider.suggestTasks).not.toHaveBeenCalled();
	});

	it("throws when minting a signed URL fails for any photo", async () => {
		const photos = [
			{
				id: "ph-1",
				storage_bucket: "source-photos",
				storage_path: "user-1/p1.png",
				notes: null,
			},
		];
		const { supabase } = buildSupabaseStub({
			photosResult: { data: photos, error: null },
			signedUrlResult: { data: null, error: { message: "boom" } },
		});
		const provider = buildMockProvider();

		await expect(
			__suggestTasksForProjectHandler({
				userId: "user-1",
				supabase,
				provider,
				input: { projectId: "p1", projectNotes: "" },
			})
		).rejects.toThrow("Failed to mint signed URL");
		expect(provider.suggestTasks).not.toHaveBeenCalled();
	});
});

describe("getTaskStyleHandler", () => {
	it("returns the task's stored Style", async () => {
		const { supabase, fromMock } = buildSupabaseStub({
			styleResult: { data: { style: "industrial" }, error: null },
		});

		const result = await __getTaskStyleHandler({
			userId: "user-1",
			supabase,
			input: { taskId: "task-1" },
		});

		expect(result).toEqual({ style: "industrial" });
		expect(fromMock).toHaveBeenCalledWith("renovation_tasks");
	});

	it("falls back to the default Style when the column is null", async () => {
		const { supabase } = buildSupabaseStub({
			styleResult: { data: { style: null }, error: null },
		});

		const result = await __getTaskStyleHandler({
			userId: "user-1",
			supabase,
			input: { taskId: "task-1" },
		});

		expect(result).toEqual({ style: "scandinavian" });
	});

	it("throws when the task is not owned / not found", async () => {
		const { supabase } = buildSupabaseStub({
			styleResult: { data: null, error: null },
		});

		await expect(
			__getTaskStyleHandler({
				userId: "user-1",
				supabase,
				input: { taskId: "task-1" },
			})
		).rejects.toThrow("Task not found");
	});
});

describe("setTaskStyleHandler", () => {
	it("persists the chosen Style and echoes it back", async () => {
		const { supabase, tasksChain } = buildSupabaseStub({
			styleResult: { data: { style: "industrial" }, error: null },
		});

		const result = await __setTaskStyleHandler({
			userId: "user-1",
			supabase,
			input: { taskId: "task-1", style: "industrial" },
		});

		expect(result).toEqual({ style: "industrial" });
		expect(tasksChain.update).toHaveBeenCalledWith({ style: "industrial" });
	});

	it("throws when the update matches no owned task", async () => {
		const { supabase } = buildSupabaseStub({
			styleResult: { data: null, error: null },
		});

		await expect(
			__setTaskStyleHandler({
				userId: "user-1",
				supabase,
				input: { taskId: "task-1", style: "industrial" },
			})
		).rejects.toThrow("Task not found");
	});
});

describe("updateTaskHandler", () => {
	it("updates title, category, and notes scoped to the owner", async () => {
		const updated = {
			id: "task-1",
			title: "Master bedroom",
			category: "bedroom",
			notes: "north-facing",
		};
		// The handler terminates on `.maybeSingle()`, which the stub resolves
		// from `styleResult`.
		const { supabase, tasksChain } = buildSupabaseStub({
			styleResult: { data: updated, error: null },
		});

		const result = await __updateTaskHandler({
			userId: "user-1",
			supabase,
			input: {
				taskId: "task-1",
				title: "Master bedroom",
				category: "bedroom",
				notes: "north-facing",
			},
		});

		expect(result).toEqual(updated);
		expect(tasksChain.update).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "Master bedroom",
				category: "bedroom",
				notes: "north-facing",
			})
		);
	});

	it("coerces an omitted notes value to null so the column can be cleared", async () => {
		const { supabase, tasksChain } = buildSupabaseStub({
			styleResult: { data: { id: "task-1" }, error: null },
		});

		await __updateTaskHandler({
			userId: "user-1",
			supabase,
			input: { taskId: "task-1", title: "Kitchen", category: "kitchen" },
		});

		expect(tasksChain.update).toHaveBeenCalledWith(
			expect.objectContaining({ notes: null })
		);
	});

	it("throws when the update matches no owned task", async () => {
		const { supabase } = buildSupabaseStub({
			styleResult: { data: null, error: null },
		});

		await expect(
			__updateTaskHandler({
				userId: "user-1",
				supabase,
				input: { taskId: "task-1", title: "x", category: "y" },
			})
		).rejects.toThrow("Task not found");
	});

	it("wraps update errors instead of leaking raw messages", async () => {
		const { supabase } = buildSupabaseStub({
			styleResult: { data: null, error: { message: "boom" } },
		});

		await expect(
			__updateTaskHandler({
				userId: "user-1",
				supabase,
				input: { taskId: "task-1", title: "x", category: "y" },
			})
		).rejects.toThrow("Database error");
	});
});

/**
 * Build a stub for the room-delete handler. Each table name maps to a queue of
 * terminal results consumed in call order, so the two `task_photos` lookups
 * (links, then shared) and the two `photos` calls (select, then delete) can
 * return different rows. Storage exposes one shared `remove` mock.
 */
function buildTaskDeleteStub(opts: {
	generated?: { data: Row[] | null; error: unknown };
	previews?: { data: Row[] | null; error: unknown };
	taskPhotos?: { data: Row[] | null; error: unknown }[];
	photos?: { data?: Row[] | null; error: unknown }[];
	taskDelete?: { error: unknown };
}) {
	const queues: Record<string, { data?: Row[] | null; error: unknown }[]> = {
		generated_images: [opts.generated ?? { data: [], error: null }],
		structural_previews: [opts.previews ?? { data: [], error: null }],
		task_photos: opts.taskPhotos ?? [{ data: [], error: null }],
		photos: opts.photos ?? [],
		renovation_tasks: [opts.taskDelete ?? { error: null }],
	};

	const makeChain = (table: string) => {
		const chain: Record<string, unknown> = {};
		chain.select = vi.fn(() => chain);
		chain.eq = vi.fn(() => chain);
		chain.in = vi.fn(() => chain);
		chain.neq = vi.fn(() => chain);
		chain.delete = vi.fn(() => chain);
		chain.then = (
			resolve: (value: unknown) => unknown,
			reject: (reason: unknown) => unknown
		) => {
			const queue = queues[table] ?? [];
			const terminal = queue.length > 1 ? queue.shift() : queue[0];
			return Promise.resolve(terminal ?? { data: [], error: null }).then(
				resolve,
				reject
			);
		};
		return chain;
	};

	const fromMock = vi.fn((table: string) => makeChain(table));
	const remove = vi.fn(
		(): Promise<{ error: { message: string } | null }> =>
			Promise.resolve({ error: null })
	);
	const storageFrom = vi.fn(() => ({ remove }));

	return {
		supabase: {
			from: fromMock,
			storage: { from: storageFrom },
		} as unknown as Parameters<typeof __deleteTaskHandler>[0]["supabase"],
		fromMock,
		storageFrom,
		remove,
	};
}

describe("deleteTaskHandler", () => {
	beforeEach(() => vi.clearAllMocks());

	it("removes task storage + exclusively-owned photos, then deletes the room", async () => {
		const { supabase, fromMock, storageFrom, remove } = buildTaskDeleteStub({
			generated: { data: [{ storage_path: "u/g1.png" }], error: null },
			previews: { data: [{ storage_path: "u/sp1.png" }], error: null },
			// ph1 is exclusive to this room; ph2 is shared with another room.
			taskPhotos: [
				{ data: [{ photo_id: "ph1" }, { photo_id: "ph2" }], error: null },
				{ data: [{ photo_id: "ph2" }], error: null },
			],
			photos: [
				{ data: [{ storage_path: "u/src1.png" }], error: null },
				{ error: null },
			],
		});

		const result = await __deleteTaskHandler({
			userId: "user-1",
			supabase,
			input: { taskId: "task-1" },
		});

		expect(result).toEqual({ taskId: "task-1" });
		expect(fromMock).toHaveBeenCalledWith("renovation_tasks");
		expect(storageFrom).toHaveBeenCalledWith("generated-outputs");
		expect(storageFrom).toHaveBeenCalledWith("structural-previews");
		expect(storageFrom).toHaveBeenCalledWith("source-photos");
		expect(remove).toHaveBeenCalledWith(["u/g1.png"]);
		expect(remove).toHaveBeenCalledWith(["u/sp1.png"]);
		// Only the exclusive photo's object is removed — the shared one stays.
		expect(remove).toHaveBeenCalledWith(["u/src1.png"]);
	});

	it("skips photo cleanup when the room has no linked photos", async () => {
		const { supabase, fromMock, storageFrom } = buildTaskDeleteStub({
			taskPhotos: [{ data: [], error: null }],
		});

		await __deleteTaskHandler({
			userId: "user-1",
			supabase,
			input: { taskId: "task-1" },
		});

		expect(fromMock).not.toHaveBeenCalledWith("photos");
		expect(storageFrom).not.toHaveBeenCalledWith("source-photos");
	});

	it("deletes the room even when it owns no storage objects", async () => {
		const { supabase, storageFrom } = buildTaskDeleteStub({});

		const result = await __deleteTaskHandler({
			userId: "user-1",
			supabase,
			input: { taskId: "task-1" },
		});

		expect(result).toEqual({ taskId: "task-1" });
		expect(storageFrom).not.toHaveBeenCalled();
	});

	it("wraps a lookup error instead of leaking raw messages", async () => {
		const { supabase } = buildTaskDeleteStub({
			generated: { data: null, error: { message: "boom" } },
		});

		await expect(
			__deleteTaskHandler({
				userId: "user-1",
				supabase,
				input: { taskId: "task-1" },
			})
		).rejects.toThrow("Database error");
	});
});
