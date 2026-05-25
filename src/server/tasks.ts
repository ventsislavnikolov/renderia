import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { getRenovationAiProvider } from "../lib/ai/provider";
import type { ProviderDebug, RenovationAiProvider } from "../lib/ai/types";
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
		}),
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
