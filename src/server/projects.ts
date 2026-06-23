import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import {
	type CreateProjectFromPromptInput,
	type CreateProjectInput,
	createProjectFromPromptSchema,
	createProjectSchema,
	type DeleteProjectInput,
	deleteProjectSchema,
	type GetProjectInput,
	getProjectSchema,
	type UpdateProjectInput,
	updateProjectSchema,
} from "../lib/renovation/schema";
import {
	readBearerToken,
	requireAuthedSupabase,
	wrapSupabaseError,
} from "../lib/supabase/server";
import type { Database } from "../lib/types/database";

/**
 * Server functions for projects.
 *
 * Each user-facing `createServerFn(...)` export does three things and only
 * three things: extract the bearer token, resolve `{ userId, supabase }`
 * scoped to that token (so RLS evaluates as the user, not as the service
 * role), and delegate to a pure `__*Handler` function that owns the business
 * logic. Tests exercise the handlers directly with a mocked `supabase`
 * argument so we never need to spin up the TanStack server runtime.
 */

type SupabaseScoped = SupabaseClient<Database>;

/** @internal */
export async function __listProjectsHandler(args: {
	userId: string;
	supabase: SupabaseScoped;
}) {
	const { data, error } = await args.supabase
		.from("projects")
		.select("*")
		.eq("owner_id", args.userId)
		.order("created_at", { ascending: false });

	if (error) throw wrapSupabaseError(error);
	return data ?? [];
}

/** @internal */
export async function __createProjectHandler(args: {
	userId: string;
	supabase: SupabaseScoped;
	input: CreateProjectInput;
}) {
	const { data, error } = await args.supabase
		.from("projects")
		.insert({
			owner_id: args.userId,
			name: args.input.name,
			description: args.input.description ?? null,
		})
		.select()
		.single();

	if (error) throw wrapSupabaseError(error);
	return data;
}

function projectNameFromPrompt(prompt: string): string {
	const firstLine = prompt.trim().split(/\r?\n/)[0] ?? prompt.trim();
	const firstSentence =
		firstLine.match(/^(.+?[.!?])(?:\s|$)/)?.[1] ?? firstLine;
	return (
		firstSentence
			.replace(/[.!?]+$/, "")
			.slice(0, 80)
			.trim() || "New project"
	);
}

/** @internal */
export async function __createProjectFromPromptHandler(args: {
	userId: string;
	supabase: SupabaseScoped;
	input: CreateProjectFromPromptInput;
}) {
	const prompt = args.input.prompt.trim();
	const projectInsert = await args.supabase
		.from("projects")
		.insert({
			owner_id: args.userId,
			name: projectNameFromPrompt(prompt),
			description: prompt,
		})
		.select()
		.single();

	if (projectInsert.error) throw wrapSupabaseError(projectInsert.error);

	const projectId = String(projectInsert.data.id);
	const taskInsert = await args.supabase
		.from("renovation_tasks")
		.insert({
			owner_id: args.userId,
			project_id: projectId,
			title: prompt,
			category: "general",
			notes: prompt,
			status: "active",
		})
		.select()
		.single();

	if (taskInsert.error) throw wrapSupabaseError(taskInsert.error);

	return { projectId, taskId: String(taskInsert.data.id) };
}

/** @internal */
export async function __getProjectHandler(args: {
	userId: string;
	supabase: SupabaseScoped;
	input: GetProjectInput;
}) {
	const { data, error } = await args.supabase
		.from("projects")
		.select("*")
		.eq("id", args.input.projectId)
		.eq("owner_id", args.userId)
		.single();

	if (error) throw wrapSupabaseError(error);
	return data;
}

/** @internal */
export async function __updateProjectHandler(args: {
	userId: string;
	supabase: SupabaseScoped;
	input: UpdateProjectInput;
}) {
	const { data, error } = await args.supabase
		.from("projects")
		.update({
			name: args.input.name,
			description: args.input.description ?? null,
		})
		.eq("id", args.input.projectId)
		.eq("owner_id", args.userId)
		.select()
		.single();

	if (error) throw wrapSupabaseError(error);
	return data;
}

/**
 * Collect non-empty `storage_path` values from a set of rows into a removal
 * batch keyed by bucket. Skips empty batches so we never issue a no-op
 * `storage.remove([])`.
 */
function pushRemoval(
	removals: { bucket: string; paths: string[] }[],
	bucket: string,
	rows: { storage_path: string | null }[] | null
) {
	const paths = (rows ?? [])
		.map((row) => row.storage_path)
		.filter((path): path is string => Boolean(path));
	if (paths.length > 0) removals.push({ bucket, paths });
}

/**
 * @internal
 *
 * Hard-delete a project. The FK `ON DELETE CASCADE` chain removes every
 * descendant row (tasks, photos, previews, composites, generated images, and
 * their links), but the cascade is row-only — it never touches Storage. So we
 * gather every Storage object the project owns *before* the delete, then remove
 * them best-effort afterwards. See docs/adr/0003-project-delete-storage-cleanup.md.
 *
 * `furniture-references` is intentionally excluded: the Furniture Library is
 * account-wide, not project-scoped.
 */
export async function __deleteProjectHandler(args: {
	userId: string;
	supabase: SupabaseScoped;
	input: DeleteProjectInput;
}) {
	const { projectId } = args.input;
	const removals: { bucket: string; paths: string[] }[] = [];

	// Three buckets whose tables carry project_id directly.
	const photos = await args.supabase
		.from("photos")
		.select("storage_path")
		.eq("project_id", projectId)
		.eq("owner_id", args.userId);
	if (photos.error) throw wrapSupabaseError(photos.error);
	pushRemoval(removals, "source-photos", photos.data);

	const previews = await args.supabase
		.from("structural_previews")
		.select("storage_path")
		.eq("project_id", projectId)
		.eq("owner_id", args.userId);
	if (previews.error) throw wrapSupabaseError(previews.error);
	pushRemoval(removals, "structural-previews", previews.data);

	const composites = await args.supabase
		.from("room_composites")
		.select("storage_path")
		.eq("project_id", projectId)
		.eq("owner_id", args.userId);
	if (composites.error) throw wrapSupabaseError(composites.error);
	pushRemoval(removals, "room-composites", composites.data);

	// generated_images is only task-scoped, so reach it through the project's
	// tasks.
	const tasks = await args.supabase
		.from("renovation_tasks")
		.select("id")
		.eq("project_id", projectId)
		.eq("owner_id", args.userId);
	if (tasks.error) throw wrapSupabaseError(tasks.error);
	const taskIds = (tasks.data ?? []).map((row) => row.id);
	if (taskIds.length > 0) {
		const generated = await args.supabase
			.from("generated_images")
			.select("storage_path")
			.in("task_id", taskIds)
			.eq("owner_id", args.userId);
		if (generated.error) throw wrapSupabaseError(generated.error);
		pushRemoval(removals, "generated-outputs", generated.data);
	}

	// Delete the project row; the cascade clears every descendant row.
	const deleted = await args.supabase
		.from("projects")
		.delete()
		.eq("id", projectId)
		.eq("owner_id", args.userId);
	if (deleted.error) throw wrapSupabaseError(deleted.error);

	// Best-effort Storage cleanup. The rows are already gone, so a failure here
	// only leaves orphaned objects — never block the user on it.
	for (const removal of removals) {
		const result = await args.supabase.storage
			.from(removal.bucket)
			.remove(removal.paths);
		if (result.error) {
			console.error(
				`Failed to remove ${removal.bucket} objects`,
				result.error.message
			);
		}
	}

	return { projectId };
}

function readAuthToken(): string | undefined {
	return readBearerToken(getRequestHeader("authorization"));
}

export const listProjects = createServerFn({ method: "GET" }).handler(
	async () => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __listProjectsHandler({ userId, supabase });
	}
);

export const createProject = createServerFn({ method: "POST" })
	.validator(createProjectSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __createProjectHandler({ userId, supabase, input: data });
	});

export const createProjectFromPrompt = createServerFn({ method: "POST" })
	.validator(createProjectFromPromptSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __createProjectFromPromptHandler({ userId, supabase, input: data });
	});

export const getProject = createServerFn({ method: "GET" })
	.validator(getProjectSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __getProjectHandler({ userId, supabase, input: data });
	});

export const updateProject = createServerFn({ method: "POST" })
	.validator(updateProjectSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __updateProjectHandler({ userId, supabase, input: data });
	});

export const deleteProject = createServerFn({ method: "POST" })
	.validator(deleteProjectSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __deleteProjectHandler({ userId, supabase, input: data });
	});
