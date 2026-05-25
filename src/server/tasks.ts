import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { getRenovationAiProvider } from "../lib/ai/provider";
import type { RenovationAiProvider } from "../lib/ai/types";
import {
	type CreateTaskInput,
	createTaskSchema,
	type ListTasksInput,
	listTasksSchema,
	type SuggestTasksInput,
	suggestTasksSchema,
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
 * The suggester reads the project's photos under RLS, then hands raw
 * storage paths to the provider as `signedUrl`. The plan documents this as
 * an interim signed-URL stand-in — a follow-up task can swap this for
 * actual signed URLs from Supabase Storage once the upload flow is wired.
 */

type SupabaseScoped = SupabaseClient<Database>;

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
export async function __suggestTasksForProjectHandler(args: {
	userId: string;
	supabase: SupabaseScoped;
	provider: RenovationAiProvider;
	input: SuggestTasksInput;
}) {
	const { data, error } = await args.supabase
		.from("photos")
		.select("id, storage_path, notes")
		.eq("owner_id", args.userId)
		.eq("project_id", args.input.projectId);

	if (error) throw wrapSupabaseError(error);

	const photos = (data ?? []).map((photo) => {
		const id = String((photo as { id: unknown }).id);
		const signedUrl = String((photo as { storage_path: unknown }).storage_path);
		const notesRaw = (photo as { notes: unknown }).notes;
		const notes = typeof notesRaw === "string" ? notesRaw : undefined;
		return notes === undefined ? { id, signedUrl } : { id, signedUrl, notes };
	});

	return args.provider.suggestTasks({
		projectNotes: args.input.projectNotes,
		photos,
	});
}

function readAuthToken(): string | undefined {
	return readBearerToken(getRequestHeader("authorization"));
}

export const listProjectTasks = createServerFn({ method: "GET" })
	.inputValidator(listTasksSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __listProjectTasksHandler({ userId, supabase, input: data });
	});

export const createTask = createServerFn({ method: "POST" })
	.inputValidator(createTaskSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __createTaskHandler({ userId, supabase, input: data });
	});

export const suggestTasksForProject = createServerFn({ method: "POST" })
	.inputValidator(suggestTasksSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __suggestTasksForProjectHandler({
			userId,
			supabase,
			provider: getRenovationAiProvider(),
			input: data,
		});
	});
