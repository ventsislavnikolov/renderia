import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import {
	type CreatePhotoInput,
	createPhotoSchema,
	type ListPhotosInput,
	listPhotosSchema,
} from "../lib/renovation/schema";
import {
	readBearerToken,
	requireAuthedSupabase,
	wrapSupabaseError,
} from "../lib/supabase/server";
import type { Database } from "../lib/types/database";

/**
 * Server functions for photo metadata.
 *
 * Storage uploads themselves go directly to Supabase Storage from the
 * browser using the user's JWT and the `source-photos` bucket policies; we
 * only persist the metadata row here so the rest of the app can join photos
 * to projects/tasks via foreign keys.
 */

type SupabaseScoped = SupabaseClient<Database>;

/** @internal */
export async function __listProjectPhotosHandler(args: {
	userId: string;
	supabase: SupabaseScoped;
	input: ListPhotosInput;
}) {
	const { data, error } = await args.supabase
		.from("task_photos")
		.select("photos(*)")
		.eq("owner_id", args.userId)
		.eq("project_id", args.input.projectId)
		.eq("task_id", args.input.taskId);

	if (error) throw wrapSupabaseError(error);
	return (data ?? []).flatMap((row) => {
		const photo = row.photos;
		return photo ? [photo] : [];
	});
}

/** @internal */
export async function __createPhotoRecordHandler(args: {
	userId: string;
	supabase: SupabaseScoped;
	input: CreatePhotoInput;
}) {
	// Parent-ownership pre-check. See __createTaskHandler for the same
	// pattern — RLS will reject mismatches anyway, but going through a
	// select first lets us surface a clean "Task not found" instead of a
	// raw PostgREST policy error.
	const parent = await args.supabase
		.from("renovation_tasks")
		.select("id")
		.eq("id", args.input.taskId)
		.eq("project_id", args.input.projectId)
		.eq("owner_id", args.userId)
		.maybeSingle();

	if (parent.error) throw wrapSupabaseError(parent.error);
	if (!parent.data) throw new Error("Task not found");

	const { data, error } = await args.supabase
		.from("photos")
		.insert({
			owner_id: args.userId,
			project_id: args.input.projectId,
			storage_path: args.input.storagePath,
			original_name: args.input.originalName,
			content_type: args.input.contentType,
			notes: args.input.notes ?? null,
		})
		.select()
		.single();

	if (error) throw wrapSupabaseError(error);
	const link = await args.supabase.from("task_photos").insert({
		owner_id: args.userId,
		project_id: args.input.projectId,
		task_id: args.input.taskId,
		photo_id: data.id,
	});

	if (link.error) throw wrapSupabaseError(link.error);
	return data;
}

function readAuthToken(): string | undefined {
	return readBearerToken(getRequestHeader("authorization"));
}

export const listProjectPhotos = createServerFn({ method: "GET" })
	.inputValidator(listPhotosSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __listProjectPhotosHandler({ userId, supabase, input: data });
	});

export const createPhotoRecord = createServerFn({ method: "POST" })
	.inputValidator(createPhotoSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __createPhotoRecordHandler({ userId, supabase, input: data });
	});
