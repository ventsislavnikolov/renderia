import { describe, expect, it, vi } from "vitest";

import type { RenovationAiProvider } from "../../../src/lib/ai/types";
import {
	__createTaskHandler,
	__listProjectTasksHandler,
	__suggestTasksForProjectHandler,
} from "../../../src/server/tasks";

type Row = Record<string, unknown>;

/**
 * Build a PostgREST query stub keyed by table name.
 *
 * `projectsResult` controls what `.from("projects").select().eq().eq().maybeSingle()`
 * returns — used by the parent-ownership pre-check in `__createTaskHandler`.
 * Default is an owned project so existing happy-path tests keep working.
 */
function buildSupabaseStub(opts: {
	listResult?: { data: Row[] | null; error: unknown };
	photosResult?: { data: Row[] | null; error: unknown };
	singleResult?: { data: Row | null; error: unknown };
	projectsResult?: { data: Row | null; error: unknown };
}) {
	const fromMock = vi.fn();
	const tasksChain: Record<string, (...args: unknown[]) => unknown> = {};
	tasksChain.select = vi.fn(() => tasksChain);
	tasksChain.eq = vi.fn(() => tasksChain);
	tasksChain.order = vi.fn(() =>
		Promise.resolve(opts.listResult ?? { data: [], error: null }),
	);
	tasksChain.single = vi.fn(() =>
		Promise.resolve(opts.singleResult ?? { data: null, error: null }),
	);
	tasksChain.insert = vi.fn(() => tasksChain);

	const photosChain: Record<string, (...args: unknown[]) => unknown> = {};
	photosChain.select = vi.fn(() => photosChain);
	photosChain.eq = vi.fn(() =>
		Object.assign(photosChain, {
			then: (resolve: (value: unknown) => unknown) =>
				resolve(opts.photosResult ?? { data: [], error: null }),
		}),
	);

	const projectsChain: Record<string, (...args: unknown[]) => unknown> = {};
	projectsChain.select = vi.fn(() => projectsChain);
	projectsChain.eq = vi.fn(() => projectsChain);
	projectsChain.maybeSingle = vi.fn(() =>
		Promise.resolve(
			opts.projectsResult ?? { data: { id: "p1" }, error: null },
		),
	);

	fromMock.mockImplementation((table: string) => {
		if (table === "photos") return photosChain;
		if (table === "projects") return projectsChain;
		return tasksChain;
	});
	return {
		supabase: { from: fromMock } as unknown as Parameters<
			typeof __listProjectTasksHandler
		>[0]["supabase"],
		fromMock,
		tasksChain,
		projectsChain,
	};
}

function buildMockProvider(): RenovationAiProvider & {
	suggestTasks: ReturnType<typeof vi.fn>;
} {
	const provider = {
		suggestTasks: vi.fn().mockResolvedValue([
			{ title: "ceiling", category: "ceiling", rationale: "r" },
		]),
		detectProtectedElements: vi.fn().mockResolvedValue([]),
		createDesignBrief: vi
			.fn()
			.mockResolvedValue({ markdown: "", prompt: "" }),
		generateRenovationImages: vi.fn().mockResolvedValue([]),
	};
	return provider as unknown as RenovationAiProvider & {
		suggestTasks: ReturnType<typeof vi.fn>;
	};
}

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
			}),
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
			}),
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
			}),
		).rejects.toThrow("Project not found");
		// Insert was never reached — pre-check short-circuited.
		expect(tasksChain.insert).not.toHaveBeenCalled();
	});
});

describe("suggestTasksForProjectHandler", () => {
	it("loads project photos and passes them to the AI provider", async () => {
		const photos = [
			{ id: "ph-1", storage_path: "user-1/p1.png", notes: "broken tile" },
			{ id: "ph-2", storage_path: "user-1/p2.png", notes: null },
		];
		const { supabase } = buildSupabaseStub({
			photosResult: { data: photos, error: null },
		});
		const provider = buildMockProvider();

		const result = await __suggestTasksForProjectHandler({
			userId: "user-1",
			supabase,
			provider,
			input: { projectId: "p1", projectNotes: "needs work" },
		});

		expect(result).toEqual([
			{ title: "ceiling", category: "ceiling", rationale: "r" },
		]);
		expect(provider.suggestTasks).toHaveBeenCalledWith({
			projectNotes: "needs work",
			photos: [
				{ id: "ph-1", signedUrl: "user-1/p1.png", notes: "broken tile" },
				{ id: "ph-2", signedUrl: "user-1/p2.png" },
			],
		});
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
			}),
		).rejects.toThrow("Database error");
		expect(provider.suggestTasks).not.toHaveBeenCalled();
	});
});
