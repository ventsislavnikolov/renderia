import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	__createProjectFromPromptHandler,
	__createProjectHandler,
	__deleteProjectHandler,
	__getProjectHandler,
	__listProjectsHandler,
	__updateProjectHandler,
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

/** Build an update chain: `.update().eq().eq().select().single()`. */
function buildUpdateStub(singleResult: { data: Row | null; error: unknown }) {
	const chain: Record<string, (...args: unknown[]) => unknown> = {};
	chain.update = vi.fn(() => chain);
	chain.eq = vi.fn(() => chain);
	chain.select = vi.fn(() => chain);
	chain.single = vi.fn(() => Promise.resolve(singleResult));
	const fromMock = vi.fn(() => chain);
	return {
		supabase: { from: fromMock } as unknown as Parameters<
			typeof __updateProjectHandler
		>[0]["supabase"],
		chain,
		fromMock,
	};
}

describe("updateProjectHandler", () => {
	beforeEach(() => vi.clearAllMocks());

	it("updates name and description scoped to the owner", async () => {
		const updated = {
			id: "p1",
			owner_id: "user-1",
			name: "New name",
			description: "New description",
		};
		const { supabase, chain, fromMock } = buildUpdateStub({
			data: updated,
			error: null,
		});

		const result = await __updateProjectHandler({
			userId: "user-1",
			supabase,
			input: {
				projectId: "p1",
				name: "New name",
				description: "New description",
			},
		});

		expect(result).toEqual(updated);
		expect(fromMock).toHaveBeenCalledWith("projects");
		expect(chain.update).toHaveBeenCalledWith({
			name: "New name",
			description: "New description",
		});
		expect(chain.eq).toHaveBeenCalledWith("id", "p1");
		expect(chain.eq).toHaveBeenCalledWith("owner_id", "user-1");
	});

	it("coerces an omitted description to null so the column can be cleared", async () => {
		const { supabase, chain } = buildUpdateStub({
			data: { id: "p1", name: "New name", description: null },
			error: null,
		});

		await __updateProjectHandler({
			userId: "user-1",
			supabase,
			input: { projectId: "p1", name: "New name" },
		});

		expect(chain.update).toHaveBeenCalledWith({
			name: "New name",
			description: null,
		});
	});

	it("wraps update errors instead of leaking raw messages", async () => {
		const { supabase } = buildUpdateStub({
			data: null,
			error: { message: "boom" },
		});

		await expect(
			__updateProjectHandler({
				userId: "user-1",
				supabase,
				input: { projectId: "p1", name: "x" },
			})
		).rejects.toThrow("Database error");
	});
});

/**
 * Build a stub for the delete handler. Every project-scoped lookup is awaited
 * directly (thenable chain), the project delete resolves `projectsDelete`, and
 * Storage exposes a single shared `remove` mock so calls across buckets can be
 * asserted together.
 */
function buildDeleteStub(opts: {
	photos?: { data: Row[] | null; error: unknown };
	previews?: { data: Row[] | null; error: unknown };
	tasks?: { data: Row[] | null; error: unknown };
	generated?: { data: Row[] | null; error: unknown };
	projectsDelete?: { error: unknown };
}) {
	const results: Record<string, unknown> = {
		photos: opts.photos ?? { data: [], error: null },
		structural_previews: opts.previews ?? { data: [], error: null },
		renovation_tasks: opts.tasks ?? { data: [], error: null },
		generated_images: opts.generated ?? { data: [], error: null },
		projects: opts.projectsDelete ?? { error: null },
	};

	const makeChain = (terminal: unknown) => {
		const chain: Record<string, unknown> = {};
		chain.select = vi.fn(() => chain);
		chain.eq = vi.fn(() => chain);
		chain.in = vi.fn(() => chain);
		chain.delete = vi.fn(() => chain);
		chain.then = (
			resolve: (value: unknown) => unknown,
			reject: (reason: unknown) => unknown
		) => Promise.resolve(terminal).then(resolve, reject);
		return chain;
	};

	const fromMock = vi.fn((table: string) => makeChain(results[table]));
	const remove = vi.fn(
		(): Promise<{ error: { message: string } | null }> =>
			Promise.resolve({ error: null })
	);
	const storageFrom = vi.fn(() => ({ remove }));

	return {
		supabase: {
			from: fromMock,
			storage: { from: storageFrom },
		} as unknown as Parameters<typeof __deleteProjectHandler>[0]["supabase"],
		fromMock,
		storageFrom,
		remove,
	};
}

describe("deleteProjectHandler", () => {
	beforeEach(() => vi.clearAllMocks());

	it("gathers paths from every bucket, deletes the project, and removes the objects", async () => {
		const { supabase, fromMock, storageFrom, remove } = buildDeleteStub({
			photos: {
				data: [{ storage_path: "u/p1.png" }, { storage_path: null }],
				error: null,
			},
			previews: { data: [{ storage_path: "u/sp1.png" }], error: null },
			tasks: { data: [{ id: "t1" }, { id: "t2" }], error: null },
			generated: { data: [{ storage_path: "u/g1.png" }], error: null },
		});

		const result = await __deleteProjectHandler({
			userId: "user-1",
			supabase,
			input: { projectId: "p1" },
		});

		expect(result).toEqual({ projectId: "p1" });
		expect(fromMock).toHaveBeenCalledWith("projects");
		expect(storageFrom).toHaveBeenCalledWith("source-photos");
		expect(storageFrom).toHaveBeenCalledWith("structural-previews");
		expect(storageFrom).toHaveBeenCalledWith("generated-outputs");
		// The null storage_path is filtered out, never handed to remove().
		expect(remove).toHaveBeenCalledWith(["u/p1.png"]);
		expect(remove).toHaveBeenCalledWith(["u/sp1.png"]);
		expect(remove).toHaveBeenCalledWith(["u/g1.png"]);
	});

	it("skips generated-outputs entirely when the project has no tasks", async () => {
		const { supabase, fromMock, storageFrom } = buildDeleteStub({
			tasks: { data: [], error: null },
		});

		await __deleteProjectHandler({
			userId: "user-1",
			supabase,
			input: { projectId: "p1" },
		});

		expect(fromMock).not.toHaveBeenCalledWith("generated_images");
		expect(storageFrom).not.toHaveBeenCalledWith("generated-outputs");
	});

	it("deletes the project even when it owns no storage objects", async () => {
		const { supabase, storageFrom } = buildDeleteStub({});

		const result = await __deleteProjectHandler({
			userId: "user-1",
			supabase,
			input: { projectId: "p1" },
		});

		expect(result).toEqual({ projectId: "p1" });
		expect(storageFrom).not.toHaveBeenCalled();
	});

	it("is best-effort: a storage removal failure does not fail the delete", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const { supabase, remove } = buildDeleteStub({
			photos: { data: [{ storage_path: "u/p1.png" }], error: null },
		});
		remove.mockResolvedValueOnce({ error: { message: "nope" } });

		const result = await __deleteProjectHandler({
			userId: "user-1",
			supabase,
			input: { projectId: "p1" },
		});

		expect(result).toEqual({ projectId: "p1" });
		expect(consoleError).toHaveBeenCalled();
		consoleError.mockRestore();
	});

	it("wraps errors raised while gathering storage paths", async () => {
		const { supabase } = buildDeleteStub({
			photos: { data: null, error: { message: "boom" } },
		});

		await expect(
			__deleteProjectHandler({
				userId: "user-1",
				supabase,
				input: { projectId: "p1" },
			})
		).rejects.toThrow("Database error");
	});

	it("wraps the project delete error", async () => {
		const { supabase } = buildDeleteStub({
			projectsDelete: { error: { message: "boom" } },
		});

		await expect(
			__deleteProjectHandler({
				userId: "user-1",
				supabase,
				input: { projectId: "p1" },
			})
		).rejects.toThrow("Database error");
	});
});
