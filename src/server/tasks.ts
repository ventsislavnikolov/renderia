import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { getRenovationAiProvider } from "../lib/ai/provider";
import { DEFAULT_STYLE_ID } from "../lib/ai/style-presets";
import type { ProviderDebug, RenovationAiProvider } from "../lib/ai/types";
import {
	type CreateTaskInput,
	createTaskSchema,
	type DeleteTaskInput,
	deleteTaskSchema,
	type GetTaskStyleInput,
	getTaskStyleSchema,
	type ListTasksInput,
	listTasksSchema,
	type SetTaskStyleInput,
	type SuggestTasksInput,
	setTaskStyleSchema,
	suggestTasksSchema,
	type UpdateTaskInput,
	updateTaskSchema,
} from "../lib/renovation/schema";
import {
	readBearerToken,
	requireAuthedSupabase,
	wrapSupabaseError,
} from "../lib/supabase/server";
import type { Database } from "../lib/types/database";

/**
 * Server functions for renovation tasks plus the AI-backed task suggester.
 *
 * The suggester reads the project's photos under RLS and mints a short-lived
 * Supabase Storage signed URL per photo so the AI provider can attach each
 * one as a multimodal `image` content part. Storage paths alone would force
 * the model to "see" a literal URL string in the prompt — `gpt-5-mini` would
 * then refuse with "I can't access external links". Signed URLs are minted
 * per request and expire in 10 minutes; the model only needs them long
 * enough to download once.
 */

type SupabaseScoped = SupabaseClient<Database>;

const SIGNED_URL_TTL_SECONDS = 600;

/**
 * Mirror of the dev-only gate in `src/server/generation.ts`. Centralised so
 * the two AI server fns make the same prod/dev decision about leaking
 * prompts + raw responses to the client.
 */
function attachDebugIfDev<T>(value: T, debug: ProviderDebug | undefined) {
	if (process.env.NODE_ENV === "production") return { data: value };
	return debug === undefined ? { data: value } : { data: value, debug };
}

/** @internal */
export async function __listProjectTasksHandler(args: {
	userId: string;
	supabase: SupabaseScoped;
	input: ListTasksInput;
}) {
	const { data, error } = await args.supabase
		.from("renovation_tasks")
		.select("*")
		.eq("owner_id", args.userId)
		.eq("project_id", args.input.projectId)
		.order("created_at", { ascending: false });

	if (error) throw wrapSupabaseError(error);
	return data ?? [];
}

/** @internal */
export async function __createTaskHandler(args: {
	userId: string;
	supabase: SupabaseScoped;
	input: CreateTaskInput;
}) {
	// Parent-ownership pre-check. RLS will already reject the insert when the
	// parent project isn't visible to this user, but PostgREST surfaces that
	// as a generic 42501 with internals in the message. Doing the select up
	// front lets us throw a clean "Project not found" instead.
	const parent = await args.supabase
		.from("projects")
		.select("id")
		.eq("id", args.input.projectId)
		.eq("owner_id", args.userId)
		.maybeSingle();

	if (parent.error) throw wrapSupabaseError(parent.error);
	if (!parent.data) throw new Error("Project not found");

	const { data, error } = await args.supabase
		.from("renovation_tasks")
		.insert({
			owner_id: args.userId,
			project_id: args.input.projectId,
			title: args.input.title,
			category: args.input.category,
			notes: args.input.notes ?? null,
			status: "active",
		})
		.select()
		.single();

	if (error) throw wrapSupabaseError(error);
	return data;
}

/** @internal */
export async function __updateTaskHandler(args: {
	userId: string;
	supabase: SupabaseScoped;
	input: UpdateTaskInput;
}) {
	const { data, error } = await args.supabase
		.from("renovation_tasks")
		.update({
			title: args.input.title,
			category: args.input.category,
			notes: args.input.notes ?? null,
			updated_at: new Date().toISOString(),
		})
		.eq("id", args.input.taskId)
		.eq("owner_id", args.userId)
		.select()
		.maybeSingle();

	if (error) throw wrapSupabaseError(error);
	if (!data) throw new Error("Task not found");
	return data;
}

/**
 * Collect non-empty `storage_path` values into a removal batch keyed by bucket.
 * Skips empty batches so we never issue a no-op `storage.remove([])`. Mirrors
 * the helper in `src/server/projects.ts`.
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
 * Hard-delete a single room (task). The FK `ON DELETE CASCADE` chain clears
 * every task-scoped descendant row (briefs, jobs, generated images, structural
 * previews, room state, protected elements, and the `task_photos` links), but
 * the cascade is row-only — it never touches Storage, and `photos` rows are
 * project-scoped so they survive the cascade. So we:
 *   1. gather the task's own Storage objects (generated outputs, previews),
 *   2. find source photos linked *only* to this room (a photo shared with
 *      another room must stay), delete those orphaned rows, and queue their
 *      objects for removal,
 *   3. delete the task row,
 *   4. remove the Storage objects best-effort.
 * Same philosophy as the project delete — see
 * docs/adr/0003-project-delete-storage-cleanup.md.
 */
export async function __deleteTaskHandler(args: {
	userId: string;
	supabase: SupabaseScoped;
	input: DeleteTaskInput;
}) {
	const { taskId } = args.input;
	const removals: { bucket: string; paths: string[] }[] = [];

	const generated = await args.supabase
		.from("generated_images")
		.select("storage_path")
		.eq("task_id", taskId)
		.eq("owner_id", args.userId);
	if (generated.error) throw wrapSupabaseError(generated.error);
	pushRemoval(removals, "generated-outputs", generated.data);

	const previews = await args.supabase
		.from("structural_previews")
		.select("storage_path")
		.eq("task_id", taskId)
		.eq("owner_id", args.userId);
	if (previews.error) throw wrapSupabaseError(previews.error);
	pushRemoval(removals, "structural-previews", previews.data);

	// Source photos are project-scoped and reached through the `task_photos`
	// join, so a photo can in principle belong to more than one room. Only the
	// photos linked *exclusively* to this room are safe to delete.
	const links = await args.supabase
		.from("task_photos")
		.select("photo_id")
		.eq("task_id", taskId)
		.eq("owner_id", args.userId);
	if (links.error) throw wrapSupabaseError(links.error);
	const photoIds = (links.data ?? []).map((row) => String(row.photo_id));

	let exclusivePhotoIds: string[] = [];
	if (photoIds.length > 0) {
		const shared = await args.supabase
			.from("task_photos")
			.select("photo_id")
			.in("photo_id", photoIds)
			.neq("task_id", taskId)
			.eq("owner_id", args.userId);
		if (shared.error) throw wrapSupabaseError(shared.error);
		const sharedIds = new Set(
			(shared.data ?? []).map((row) => String(row.photo_id))
		);
		exclusivePhotoIds = photoIds.filter((id) => !sharedIds.has(id));

		if (exclusivePhotoIds.length > 0) {
			const exclusivePhotos = await args.supabase
				.from("photos")
				.select("storage_path")
				.in("id", exclusivePhotoIds)
				.eq("owner_id", args.userId);
			if (exclusivePhotos.error) throw wrapSupabaseError(exclusivePhotos.error);
			pushRemoval(removals, "source-photos", exclusivePhotos.data);
		}
	}

	// Delete the task row; the cascade clears every task-scoped descendant.
	const deleted = await args.supabase
		.from("renovation_tasks")
		.delete()
		.eq("id", taskId)
		.eq("owner_id", args.userId);
	if (deleted.error) throw wrapSupabaseError(deleted.error);

	// The cascade dropped the `task_photos` links but not the project-scoped
	// `photos` rows, so remove the now-orphaned exclusive photos explicitly.
	// Best-effort: the room is already gone, so don't fail the user on cleanup.
	if (exclusivePhotoIds.length > 0) {
		const removedPhotos = await args.supabase
			.from("photos")
			.delete()
			.in("id", exclusivePhotoIds)
			.eq("owner_id", args.userId);
		if (removedPhotos.error) {
			console.error(
				"Failed to remove orphaned photos",
				removedPhotos.error.message
			);
		}
	}

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

	return { taskId };
}

/** @internal */
export async function __getTaskStyleHandler(args: {
	userId: string;
	supabase: SupabaseScoped;
	input: GetTaskStyleInput;
}): Promise<{ style: string }> {
	const { data, error } = await args.supabase
		.from("renovation_tasks")
		.select("style")
		.eq("id", args.input.taskId)
		.eq("owner_id", args.userId)
		.maybeSingle();
	if (error) throw wrapSupabaseError(error);
	if (!data) throw new Error("Task not found");
	return { style: data.style ?? DEFAULT_STYLE_ID };
}

/** @internal */
export async function __setTaskStyleHandler(args: {
	userId: string;
	supabase: SupabaseScoped;
	input: SetTaskStyleInput;
}): Promise<{ style: string }> {
	const { data, error } = await args.supabase
		.from("renovation_tasks")
		.update({ style: args.input.style })
		.eq("id", args.input.taskId)
		.eq("owner_id", args.userId)
		.select("style")
		.maybeSingle();
	if (error) throw wrapSupabaseError(error);
	if (!data) throw new Error("Task not found");
	return { style: data.style ?? DEFAULT_STYLE_ID };
}

/** @internal */
export async function __suggestTasksForProjectHandler(args: {
	userId: string;
	supabase: SupabaseScoped;
	provider: RenovationAiProvider;
	input: SuggestTasksInput;
}) {
	const { data, error } = await args.supabase
		.from("photos")
		.select("id, storage_bucket, storage_path, notes")
		.eq("owner_id", args.userId)
		.eq("project_id", args.input.projectId);

	if (error) throw wrapSupabaseError(error);

	// Mint a fresh signed URL per photo. Done in parallel so a project with N
	// photos doesn't add N round-trip latencies serially — the limiting factor
	// is the slowest single call, not the sum.
	const photoRows = (data ?? []) as Array<{
		id: unknown;
		storage_bucket: unknown;
		storage_path: unknown;
		notes: unknown;
	}>;
	const photos = await Promise.all(
		photoRows.map(async (photo) => {
			const id = String(photo.id);
			const bucket = String(photo.storage_bucket);
			const path = String(photo.storage_path);
			const notesRaw = photo.notes;
			const notes = typeof notesRaw === "string" ? notesRaw : undefined;

			const signed = await args.supabase.storage
				.from(bucket)
				.createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
			if (signed.error || !signed.data?.signedUrl) {
				throw new Error("Failed to mint signed URL for project photo");
			}
			const signedUrl = signed.data.signedUrl;
			return notes === undefined ? { id, signedUrl } : { id, signedUrl, notes };
		})
	);

	const result = await args.provider.suggestTasks({
		projectNotes: args.input.projectNotes,
		photos,
	});
	return attachDebugIfDev(result.value, result.debug);
}

function readAuthToken(): string | undefined {
	return readBearerToken(getRequestHeader("authorization"));
}

export const listProjectTasks = createServerFn({ method: "GET" })
	.validator(listTasksSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __listProjectTasksHandler({ userId, supabase, input: data });
	});

export const createTask = createServerFn({ method: "POST" })
	.validator(createTaskSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __createTaskHandler({ userId, supabase, input: data });
	});

export const updateTask = createServerFn({ method: "POST" })
	.validator(updateTaskSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __updateTaskHandler({ userId, supabase, input: data });
	});

export const deleteTask = createServerFn({ method: "POST" })
	.validator(deleteTaskSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __deleteTaskHandler({ userId, supabase, input: data });
	});

export const getTaskStyle = createServerFn({ method: "GET" })
	.validator(getTaskStyleSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __getTaskStyleHandler({ userId, supabase, input: data });
	});

export const setTaskStyle = createServerFn({ method: "POST" })
	.validator(setTaskStyleSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __setTaskStyleHandler({ userId, supabase, input: data });
	});

export const suggestTasksForProject = createServerFn({ method: "POST" })
	.validator(suggestTasksSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __suggestTasksForProjectHandler({
			userId,
			supabase,
			provider: getRenovationAiProvider(),
			input: data,
		});
	});
