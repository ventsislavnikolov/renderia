import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import {
	type CreateProjectFromPromptInput,
	type CreateProjectInput,
	createProjectFromPromptSchema,
	createProjectSchema,
	type GetProjectInput,
	getProjectSchema,
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
