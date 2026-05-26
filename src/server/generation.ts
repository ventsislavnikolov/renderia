import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { OPENAI_IMAGE_MODEL } from "../lib/ai/openai-provider";
import { getRenovationAiProvider } from "../lib/ai/provider";
import type { ProviderDebug, RenovationAiProvider } from "../lib/ai/types";
import {
	type CreateDesignBriefInput,
	createDesignBriefSchema,
	type DetectProtectedElementsInput,
	detectProtectedElementsSchema,
	type GenerateRenovationImagesInput,
	generateRenovationImagesSchema,
	type ListProtectedElementsInput,
	listProtectedElementsSchema,
	type SaveDetectedElementsInput,
	type SetImageFavoriteInput,
	saveDetectedElementsSchema,
	setImageFavoriteSchema,
	type UpdateProtectedElementStatusInput,
	updateProtectedElementStatusSchema,
} from "../lib/renovation/schema";
import {
	readBearerToken,
	requireAuthedSupabase,
	wrapSupabaseError,
} from "../lib/supabase/server";
import type { Database } from "../lib/types/database";

/**
 * Server functions for detection, brief, and image generation.
 *
 * Detection + brief are stateless provider passthroughs — they don't touch
 * the database. Image generation is the only persistent fn here: it inserts
 * a `generation_jobs` row, writes the provider output to the
 * `generated-outputs` storage bucket, and emits one `generated_images` row
 * per variation so the UI can render and favorite them.
 *
 * Handlers return `{ data, debug? }`. `debug` is the provider's debug
 * payload (model id, assembled prompt, raw response, duration) and is only
 * forwarded outside the server in non-production builds — see
 * `attachDebugIfDev` below. Returning the same shape in dev and prod keeps
 * the client types stable; `debug` is just always `undefined` in prod.
 */

type SupabaseScoped = SupabaseClient<Database>;

/** TTL for the signed URLs we hand back to the UI for freshly-generated images. */
const SIGNED_URL_TTL_SECONDS = 600;
const GENERATED_BUCKET = "generated-outputs" as const;

/**
 * Strip the debug payload in production so prompts and raw model responses
 * never leak to end users. Tests stub `process.env.NODE_ENV` directly when
 * they need to exercise both paths.
 */
function attachDebugIfDev<T>(value: T, debug: ProviderDebug | undefined) {
	if (process.env.NODE_ENV === "production") return { data: value };
	return debug === undefined ? { data: value } : { data: value, debug };
}

/** @internal */
export async function __detectProtectedElementsHandler(args: {
	provider: RenovationAiProvider;
	input: DetectProtectedElementsInput;
}) {
	try {
		const result = await args.provider.detectProtectedElements(args.input);
		return attachDebugIfDev(result.value, result.debug);
	} catch (err) {
		console.error("detectProtectedElements failed", err);
		throw new Error(formatProviderError(err));
	}
}

/**
 * Unwrap the AI SDK's nested error types (RetryError → APICallError → cause)
 * and produce a human-readable string. Without this, callers see useless
 * messages like "Failed after 3 attempts. Last error: Error" because the
 * Anthropic provider's APICallError ships its body on `.responseBody` /
 * `.data` rather than in `.message`.
 */
function formatProviderError(err: unknown): string {
	const parts: string[] = [];
	let cursor: unknown = err;
	const seen = new Set<unknown>();
	while (cursor && typeof cursor === "object" && !seen.has(cursor)) {
		seen.add(cursor);
		const node = cursor as Record<string, unknown>;
		const name = typeof node.name === "string" ? node.name : "";
		const message =
			typeof node.message === "string" && node.message.length > 0
				? node.message
				: "";
		if (message && message !== "Error") {
			parts.push(name ? `${name}: ${message}` : message);
		} else if (name) {
			parts.push(name);
		}
		const body =
			(typeof node.responseBody === "string" && node.responseBody) ||
			(typeof node.data === "string" && node.data) ||
			"";
		if (body) parts.push(body.slice(0, 800));
		cursor = (node.lastError ?? node.cause) as unknown;
	}
	const joined = parts.join(" | ").trim();
	return joined.length > 0
		? joined
		: err instanceof Error && err.message
			? err.message
			: "Detection failed";
}

/** @internal */
export async function __createDesignBriefHandler(args: {
	provider: RenovationAiProvider;
	input: CreateDesignBriefInput;
}) {
	const result = await args.provider.createDesignBrief(args.input);
	return attachDebugIfDev(result.value, result.debug);
}

export type GeneratedImagePayload = {
	id: string;
	storagePath: string;
	signedUrl: string;
	variationIndex: number;
	isFavorite: boolean;
};

/**
 * Resolve the active provider's name (for the `provider` column on the job
 * row). We re-read `AI_PROVIDER` here rather than relying on the provider
 * instance because the provider type itself doesn't carry that identifier.
 */
function activeProviderName(): "openai" | "mock" {
	const value = process.env.AI_PROVIDER ?? "mock";
	return value === "openai" ? "openai" : "mock";
}

function activeImageModel(provider: "openai" | "mock"): string {
	return provider === "openai" ? OPENAI_IMAGE_MODEL : "mock-image";
}

/** @internal */
export async function __generateRenovationImagesHandler(args: {
	userId: string;
	supabase: SupabaseScoped;
	provider: RenovationAiProvider;
	providerName: "openai" | "mock";
	input: GenerateRenovationImagesInput;
}): Promise<{
	data: { jobId: string; images: GeneratedImagePayload[] };
	debug?: ProviderDebug;
}> {
	const clampedCount = Math.max(1, Math.min(args.input.count ?? 4, 4));

	// Verify task ownership up front. RLS would block the job insert anyway,
	// but a clean "Task not found" is friendlier than the wrapped 42501.
	const taskLookup = await args.supabase
		.from("renovation_tasks")
		.select("id")
		.eq("id", args.input.taskId)
		.eq("owner_id", args.userId)
		.maybeSingle();
	if (taskLookup.error) throw wrapSupabaseError(taskLookup.error);
	if (!taskLookup.data) throw new Error("Task not found");

	// Load the source photo's bytes so the provider can run image-edit mode
	// (preserves room geometry). If photoId is missing or the lookup fails we
	// silently fall back to text-only generation — the provider handles both.
	const sourceImage = args.input.photoId
		? await loadSourcePhoto({
				supabase: args.supabase,
				userId: args.userId,
				photoId: args.input.photoId,
			})
		: undefined;

	const model = activeImageModel(args.providerName);
	const jobInsert = await args.supabase
		.from("generation_jobs")
		.insert({
			owner_id: args.userId,
			task_id: args.input.taskId,
			brief_id: args.input.briefId,
			provider: args.providerName,
			model,
			status: "running",
			prompt: args.input.prompt,
		})
		.select("id")
		.single();
	if (jobInsert.error) throw wrapSupabaseError(jobInsert.error);
	const jobId = jobInsert.data.id;

	try {
		const providerResult = await args.provider.generateRenovationImages({
			sourceImage,
			prompt: args.input.prompt,
			count: clampedCount,
		});

		const uploaded: GeneratedImagePayload[] = [];
		for (let index = 0; index < providerResult.value.length; index += 1) {
			const image = providerResult.value[index];
			if (!image) continue;
			const buffer = Buffer.from(image.base64, "base64");
			const storagePath = `${args.userId}/${jobId}-${index}.png`;

			const upload = await args.supabase.storage
				.from(GENERATED_BUCKET)
				.upload(storagePath, buffer, {
					contentType: "image/png",
					upsert: false,
				});
			if (upload.error) {
				throw new Error(`Failed to upload variation ${index}`);
			}

			const inserted = await args.supabase
				.from("generated_images")
				.insert({
					owner_id: args.userId,
					job_id: jobId,
					task_id: args.input.taskId,
					storage_bucket: GENERATED_BUCKET,
					storage_path: storagePath,
					variation_index: index,
					is_favorite: false,
				})
				.select("id, storage_path, variation_index, is_favorite")
				.single();
			if (inserted.error) throw wrapSupabaseError(inserted.error);

			const signed = await args.supabase.storage
				.from(GENERATED_BUCKET)
				.createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
			if (signed.error || !signed.data?.signedUrl) {
				throw new Error("Failed to mint signed URL for generated image");
			}

			uploaded.push({
				id: String(inserted.data.id),
				storagePath: String(inserted.data.storage_path),
				signedUrl: signed.data.signedUrl,
				variationIndex: Number(inserted.data.variation_index),
				isFavorite: Boolean(inserted.data.is_favorite),
			});
		}

		const completion = await args.supabase
			.from("generation_jobs")
			.update({
				status: "succeeded",
				completed_at: new Date().toISOString(),
			})
			.eq("id", jobId)
			.eq("owner_id", args.userId);
		if (completion.error) throw wrapSupabaseError(completion.error);

		return attachDebugIfDev(
			{ jobId, images: uploaded },
			providerResult.debug
		) as {
			data: { jobId: string; images: GeneratedImagePayload[] };
			debug?: ProviderDebug;
		};
	} catch (err) {
		// Best-effort failure annotation. We don't `await` the second update's
		// outcome aggressively — surfacing the original error to the user
		// matters more than guaranteeing the bookkeeping write.
		const message = err instanceof Error ? err.message : "Generation failed";
		try {
			await args.supabase
				.from("generation_jobs")
				.update({
					status: "failed",
					error_message: message.slice(0, 1000),
					completed_at: new Date().toISOString(),
				})
				.eq("id", jobId)
				.eq("owner_id", args.userId);
		} catch (bookkeepingErr) {
			console.error("Failed to mark generation job failed", bookkeepingErr);
		}
		throw err instanceof Error ? err : new Error(message);
	}
}

/** @internal */
export async function __setImageFavoriteHandler(args: {
	userId: string;
	supabase: SupabaseScoped;
	input: SetImageFavoriteInput;
}) {
	const { data, error } = await args.supabase
		.from("generated_images")
		.update({ is_favorite: args.input.isFavorite })
		.eq("id", args.input.imageId)
		.eq("owner_id", args.userId)
		.select("id, is_favorite, storage_path, variation_index")
		.maybeSingle();
	if (error) throw wrapSupabaseError(error);
	if (!data) throw new Error("Not found");
	return data;
}

/**
 * Row shape returned to the overlay-confirm UI. We snake_case the column
 * names so the React component can pass the rows straight back to
 * `updateProtectedElementStatus` without an extra mapping layer; the DB
 * column names are stable contract here.
 */
export type ProtectedElementRow = {
	id: string;
	task_id: string;
	photo_id: string;
	project_id: string;
	label: string;
	kind: string;
	x: number;
	y: number;
	width: number;
	height: number;
	confidence: number | null;
	status: "suggested" | "confirmed" | "rejected";
	created_at: string;
};

/** @internal */
export async function __listProtectedElementsHandler(args: {
	userId: string;
	supabase: SupabaseScoped;
	input: ListProtectedElementsInput;
}): Promise<ProtectedElementRow[]> {
	const { data, error } = await args.supabase
		.from("protected_elements")
		.select(
			"id, task_id, photo_id, project_id, label, kind, x, y, width, height, confidence, status, created_at"
		)
		.eq("task_id", args.input.taskId)
		.eq("photo_id", args.input.photoId)
		.eq("owner_id", args.userId)
		.order("created_at", { ascending: true });
	if (error) throw wrapSupabaseError(error);
	return (data ?? []) as ProtectedElementRow[];
}

/** @internal */
export async function __saveDetectedElementsHandler(args: {
	userId: string;
	supabase: SupabaseScoped;
	input: SaveDetectedElementsInput;
}): Promise<ProtectedElementRow[]> {
	// Replace strategy: delete all existing rows for (task, photo, owner)
	// then insert the new set. Not transactional — if the insert fails the
	// user is left with zero persisted elements and can re-run detection.
	// This is acceptable because the alternative (an RPC + transaction)
	// adds infrastructure for a recoverable case.
	const deletion = await args.supabase
		.from("protected_elements")
		.delete()
		.eq("task_id", args.input.taskId)
		.eq("photo_id", args.input.photoId)
		.eq("owner_id", args.userId);
	if (deletion.error) throw wrapSupabaseError(deletion.error);

	if (args.input.elements.length === 0) return [];

	const rows = args.input.elements.map((element) => ({
		owner_id: args.userId,
		task_id: args.input.taskId,
		photo_id: args.input.photoId,
		project_id: args.input.projectId,
		label: element.label,
		kind: element.kind,
		x: element.x,
		y: element.y,
		width: element.width,
		height: element.height,
		confidence: element.confidence,
		status: "suggested" as const,
	}));
	const inserted = await args.supabase
		.from("protected_elements")
		.insert(rows)
		.select(
			"id, task_id, photo_id, project_id, label, kind, x, y, width, height, confidence, status, created_at"
		);
	if (inserted.error) throw wrapSupabaseError(inserted.error);
	return (inserted.data ?? []) as ProtectedElementRow[];
}

/** @internal */
export async function __updateProtectedElementStatusHandler(args: {
	userId: string;
	supabase: SupabaseScoped;
	input: UpdateProtectedElementStatusInput;
}): Promise<ProtectedElementRow> {
	const { data, error } = await args.supabase
		.from("protected_elements")
		.update({ status: args.input.status })
		.eq("id", args.input.elementId)
		.eq("owner_id", args.userId)
		.select(
			"id, task_id, photo_id, project_id, label, kind, x, y, width, height, confidence, status, created_at"
		)
		.maybeSingle();
	if (error) throw wrapSupabaseError(error);
	if (!data) throw new Error("Not found");
	return data as ProtectedElementRow;
}

function readAuthToken(): string | undefined {
	return readBearerToken(getRequestHeader("authorization"));
}

const EDITABLE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/**
 * Download the source photo's bytes so we can feed them to gpt-image-2's
 * edit endpoint. The bucket is private, so we go through the authenticated
 * Supabase client (RLS scopes to the calling user) and read the object body
 * directly — no signed-URL round-trip needed when we're already server-side.
 *
 * Returns `undefined` rather than throwing when the photo can't be loaded:
 * generation should still succeed using text-only mode in that case so a
 * stale photoId doesn't take the user's brief offline.
 */
async function loadSourcePhoto(args: {
	supabase: SupabaseScoped;
	userId: string;
	photoId: string;
}): Promise<
	| {
			base64: string;
			contentType: "image/png" | "image/jpeg" | "image/webp";
			filename: string;
	  }
	| undefined
> {
	const row = await args.supabase
		.from("photos")
		.select("storage_bucket, storage_path, content_type, original_name")
		.eq("id", args.photoId)
		.eq("owner_id", args.userId)
		.maybeSingle();
	if (row.error || !row.data) return;

	const download = await args.supabase.storage
		.from(row.data.storage_bucket)
		.download(row.data.storage_path);
	if (download.error || !download.data) return;

	const contentType = EDITABLE_IMAGE_TYPES.has(row.data.content_type)
		? (row.data.content_type as "image/png" | "image/jpeg" | "image/webp")
		: "image/png";
	const buffer = Buffer.from(await download.data.arrayBuffer());
	return {
		base64: buffer.toString("base64"),
		contentType,
		filename: row.data.original_name || "source.png",
	};
}

export const detectProtectedElements = createServerFn({ method: "POST" })
	.inputValidator(detectProtectedElementsSchema)
	.handler(async ({ data }) =>
		__detectProtectedElementsHandler({
			provider: getRenovationAiProvider(),
			input: data,
		})
	);

export const createDesignBrief = createServerFn({ method: "POST" })
	.inputValidator(createDesignBriefSchema)
	.handler(async ({ data }) =>
		__createDesignBriefHandler({
			provider: getRenovationAiProvider(),
			input: data,
		})
	);

export const generateRenovationImages = createServerFn({ method: "POST" })
	.inputValidator(generateRenovationImagesSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __generateRenovationImagesHandler({
			userId,
			supabase,
			provider: getRenovationAiProvider(),
			providerName: activeProviderName(),
			input: data,
		});
	});

export const setImageFavorite = createServerFn({ method: "POST" })
	.inputValidator(setImageFavoriteSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __setImageFavoriteHandler({ userId, supabase, input: data });
	});

export const listProtectedElements = createServerFn({ method: "POST" })
	.inputValidator(listProtectedElementsSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __listProtectedElementsHandler({ userId, supabase, input: data });
	});

export const saveDetectedElements = createServerFn({ method: "POST" })
	.inputValidator(saveDetectedElementsSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __saveDetectedElementsHandler({ userId, supabase, input: data });
	});

export const updateProtectedElementStatus = createServerFn({ method: "POST" })
	.inputValidator(updateProtectedElementStatusSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __updateProtectedElementStatusHandler({
			userId,
			supabase,
			input: data,
		});
	});
