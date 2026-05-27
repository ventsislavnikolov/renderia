import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	__createProjectFromPromptHandler,
	__createProjectHandler,
	__getProjectHandler,
	__listProjectsHandler,
} from "../../../src/server/projects";

type Row = Record<string, unknown>;

/**
 * Build a tiny PostgREST query stub. Each chained method returns the same
 * object, and the terminal awaited shape is the value set by the caller.
 * `terminal` is the value returned when the query is awaited; `single` lets
 * `.single()` produce a different terminal shape than `.then`.
 */
function buildSupabaseStub(opts: {
	listResult?: { data: Row[] | null; error: unknown };
	insertResult?: { data: Row | null; error: unknown };
	singleResult?: { data: Row | null; error: unknown };
}) {
	const fromMock = vi.fn();

	const listChain = () => {
		const chain: Record<string, (...args: unknown[]) => unknown> = {};
		chain.select = vi.fn(() => chain);
		chain.eq = vi.fn(() => chain);
		chain.order = vi.fn(() =>
			Promise.resolve(opts.listResult ?? { data: [], error: null })
		);
		chain.single = vi.fn(() =>
			Promise.resolve(opts.singleResult ?? { data: null, error: null })
		);
		chain.insert = vi.fn(() => chain);
		return chain;
	};

	fromMock.mockImplementation(() => listChain());
	return {
		supabase: { from: fromMock, auth: {} } as unknown as Parameters<
			typeof __listProjectsHandler
		>[0]["supabase"],
		fromMock,
	};
}

describe("listProjectsHandler", () => {
	beforeEach(() => vi.clearAllMocks());

	it("returns rows filtered to the user", async () => {
		const { supabase, fromMock } = buildSupabaseStub({
			listResult: {
				data: [{ id: "p1", name: "A" }],
				error: null,
			},
		});

		const result = await __listProjectsHandler({
			userId: "user-1",
			supabase,
		});

		expect(result).toEqual([{ id: "p1", name: "A" }]);
		expect(fromMock).toHaveBeenCalledWith("projects");
	});

	it("wraps Supabase errors instead of leaking raw messages", async () => {
		const { supabase } = buildSupabaseStub({
			listResult: { data: null, error: { message: "boom" } },
		});

		await expect(
			__listProjectsHandler({ userId: "user-1", supabase })
		).rejects.toThrow("Database error");
	});
});

describe("createProjectHandler", () => {
	it("inserts a row with owner_id set to the authed user", async () => {
		const inserted = {
			id: "proj-1",
			owner_id: "user-1",
			name: "City house",
			description: null,
		};
		const { supabase, fromMock } = buildSupabaseStub({
			singleResult: { data: inserted, error: null },
		});

		const result = await __createProjectHandler({
			userId: "user-1",
			supabase,
			input: { name: "City house" },
		});

		expect(result).toEqual(inserted);
		expect(fromMock).toHaveBeenCalledWith("projects");
	});

	it("wraps insert errors (e.g. 42501 maps to 'Not authorized')", async () => {
		const { supabase } = buildSupabaseStub({
			singleResult: { data: null, error: { code: "42501", message: "rls" } },
		});

		await expect(
			__createProjectHandler({
				userId: "user-1",
				supabase,
				input: { name: "x" },
			})
		).rejects.toThrow("Not authorized");
	});
});

describe("createProjectFromPromptHandler", () => {
	it("creates a project and an initial active task from the prompt", async () => {
		const projectInsert = vi.fn();
		const taskInsert = vi.fn();
		const projectSingle = vi.fn().mockResolvedValue({
			data: {
				id: "proj-1",
				owner_id: "user-1",
				name: "Renovate the attic into a warm studio",
				description: "Renovate the attic into a warm studio.",
			},
			error: null,
		});
		const taskSingle = vi.fn().mockResolvedValue({
			data: {
				id: "task-1",
				owner_id: "user-1",
				project_id: "proj-1",
				title: "Renovate the attic into a warm studio.",
				category: "general",
				status: "active",
			},
			error: null,
		});

		const projectChain = {
			insert: projectInsert.mockReturnThis(),
			select: vi.fn().mockReturnThis(),
			single: projectSingle,
		};
		const taskChain = {
			insert: taskInsert.mockReturnThis(),
			select: vi.fn().mockReturnThis(),
			single: taskSingle,
		};
		const supabase = {
			from: vi.fn((table: string) =>
				table === "projects" ? projectChain : taskChain
			),
		} as unknown as Parameters<
			typeof __createProjectFromPromptHandler
		>[0]["supabase"];

		const result = await __createProjectFromPromptHandler({
			userId: "user-1",
			supabase,
			input: { prompt: "Renovate the attic into a warm studio." },
		});

		expect(result).toEqual({ projectId: "proj-1", taskId: "task-1" });
		expect(projectInsert).toHaveBeenCalledWith({
			owner_id: "user-1",
			name: "Renovate the attic into a warm studio",
			description: "Renovate the attic into a warm studio.",
		});
		expect(taskInsert).toHaveBeenCalledWith({
			owner_id: "user-1",
			project_id: "proj-1",
			title: "Renovate the attic into a warm studio.",
			category: "general",
			notes: "Renovate the attic into a warm studio.",
			status: "active",
		});
	});
});

describe("getProjectHandler", () => {
	it("returns the matching project for the user", async () => {
		const row = {
			id: "proj-1",
			owner_id: "user-1",
			name: "City house",
		};
		const { supabase } = buildSupabaseStub({
			singleResult: { data: row, error: null },
		});

		const result = await __getProjectHandler({
			userId: "user-1",
			supabase,
			input: { projectId: "proj-1" },
		});

		expect(result).toEqual(row);
	});

	it("wraps lookup errors (PGRST116 maps to 'Not found')", async () => {
		const { supabase } = buildSupabaseStub({
			singleResult: {
				data: null,
				error: { code: "PGRST116", message: "0 rows" },
			},
		});

		await expect(
			__getProjectHandler({
				userId: "user-1",
				supabase,
				input: { projectId: "proj-1" },
			})
		).rejects.toThrow("Not found");
	});
});
