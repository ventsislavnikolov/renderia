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
	type SetImageFavoriteInput,
	setImageFavoriteSchema,
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
	const result = await args.provider.detectProtectedElements(args.input);
	return attachDebugIfDev(result.value, result.debug);
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
			sourceImageUrl: "",
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
			providerResult.debug,
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

function readAuthToken(): string | undefined {
	return readBearerToken(getRequestHeader("authorization"));
}

export const detectProtectedElements = createServerFn({ method: "POST" })
	.inputValidator(detectProtectedElementsSchema)
	.handler(async ({ data }) => {
		return __detectProtectedElementsHandler({
			provider: getRenovationAiProvider(),
			input: data,
		});
	});

export const createDesignBrief = createServerFn({ method: "POST" })
	.inputValidator(createDesignBriefSchema)
	.handler(async ({ data }) => {
		return __createDesignBriefHandler({
			provider: getRenovationAiProvider(),
			input: data,
		});
	});

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
