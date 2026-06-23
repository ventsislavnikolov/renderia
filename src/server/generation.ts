import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { OPENAI_IMAGE_MODEL } from "../lib/ai/openai-provider";
import {
	buildConceptVariationPrompts,
	buildDesignPrompt,
	buildFurnitureReferenceSection,
} from "../lib/ai/prompts";
import { getRenovationAiProvider } from "../lib/ai/provider";
import { findStylePreset } from "../lib/ai/style-presets";
import type { ProviderDebug, RenovationAiProvider } from "../lib/ai/types";
import {
	type CreateDesignBriefInput,
	createDesignBriefSchema,
	type DescribeGeneratedImagesInput,
	type DetectProtectedElementsInput,
	describeGeneratedImagesSchema,
	detectProtectedElementsSchema,
	type GenerateRenovationImagesInput,
	generateRenovationImagesSchema,
	type ListGeneratedImagesInput,
	type ListGenerationJobsInput,
	type ListProtectedElementsInput,
	type LoadLatestDesignBriefInput,
	listGeneratedImagesSchema,
	listGenerationJobsSchema,
	listProtectedElementsSchema,
	loadLatestDesignBriefSchema,
	type SaveDesignBriefInput,
	type SaveDetectedElementsInput,
	type SetImageFavoriteInput,
	saveDesignBriefSchema,
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
import { normalizeImageToPng } from "./image-normalize";

/**
 * Server functions for detection, brief, and image generation.
 *
 * Detection is a stateless provider passthrough. Brief generation persists a
 * `design_briefs` row, and image generation inserts a `generation_jobs` row,
 * writes the provider output to the
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
	userId: string;
	supabase: SupabaseScoped;
	provider: RenovationAiProvider;
	input: DetectProtectedElementsInput;
}) {
	try {
		const taskLookup = await args.supabase
			.from("renovation_tasks")
			.select("id, project_id")
			.eq("id", args.input.taskId)
			.eq("owner_id", args.userId)
			.maybeSingle();
		if (taskLookup.error) throw wrapSupabaseError(taskLookup.error);
		if (!taskLookup.data) throw new Error("Task not found");

		const photoLookup = await args.supabase
			.from("photos")
			.select("storage_bucket, storage_path, project_id")
			.eq("id", args.input.photoId)
			.eq("owner_id", args.userId)
			.maybeSingle();
		if (photoLookup.error) throw wrapSupabaseError(photoLookup.error);
		if (!photoLookup.data) throw new Error("Photo not found");
		if (photoLookup.data.project_id !== taskLookup.data.project_id) {
			throw new Error("Photo not found");
		}

		const signed = await args.supabase.storage
			.from(photoLookup.data.storage_bucket)
			.createSignedUrl(photoLookup.data.storage_path, SIGNED_URL_TTL_SECONDS);
		if (signed.error || !signed.data?.signedUrl) {
			throw new Error("Failed to mint signed URL for source photo");
		}

		const result = await args.provider.detectProtectedElements({
			photoUrl: signed.data.signedUrl,
			taskTitle: args.input.taskTitle,
			notes: args.input.notes,
			model: args.input.model,
		});
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

/**
 * Resolve a Task's chosen Style id from the DB so the design prompt is built
 * against the authoritative server-side value rather than a client-supplied
 * one. The prompt builders fall back to Scandinavian when this is undefined.
 */
async function __resolveTaskStyle(
	supabase: SupabaseScoped,
	userId: string,
	taskId: string
): Promise<string | undefined> {
	const { data, error } = await supabase
		.from("renovation_tasks")
		.select("style")
		.eq("id", taskId)
		.eq("owner_id", userId)
		.maybeSingle();
	if (error) throw wrapSupabaseError(error);
	return data?.style ?? undefined;
}

/** @internal */
export async function __createDesignBriefHandler(args: {
	userId: string;
	supabase: SupabaseScoped;
	provider: RenovationAiProvider;
	input: CreateDesignBriefInput;
}) {
	const style = await __resolveTaskStyle(
		args.supabase,
		args.userId,
		args.input.taskId
	);
	const providerInput = { ...args.input, style };
	const result = await args.provider.createDesignBrief(providerInput);
	const { data, error } = await args.supabase
		.from("design_briefs")
		.insert({
			owner_id: args.userId,
			task_id: args.input.taskId,
			style_rules: args.input.styleRules,
			markdown: result.value.markdown,
			prompt: result.value.prompt,
		})
		.select("id, markdown, prompt, version")
		.single();
	if (error) throw wrapSupabaseError(error);

	return attachDebugIfDev(
		{
			id: String(data.id),
			markdown: String(data.markdown),
			prompt: String(data.prompt),
			version: Number(data.version),
		},
		result.debug
	);
}

export type LoadedDesignBrief = {
	id: string;
	markdown: string;
	prompt: string;
	styleRules: string;
	version: number;
};

/** @internal */
export async function __loadLatestDesignBriefHandler(args: {
	userId: string;
	supabase: SupabaseScoped;
	input: LoadLatestDesignBriefInput;
}): Promise<LoadedDesignBrief | null> {
	const { data, error } = await args.supabase
		.from("design_briefs")
		.select("id, markdown, prompt, style_rules, version")
		.eq("task_id", args.input.taskId)
		.eq("owner_id", args.userId)
		.order("version", { ascending: false })
		.order("created_at", { ascending: false })
		.limit(1)
		.maybeSingle();
	if (error) throw wrapSupabaseError(error);
	if (!data) return null;
	return {
		id: String(data.id),
		markdown: String(data.markdown),
		prompt: String(data.prompt),
		styleRules: String(data.style_rules ?? ""),
		version: Number(data.version),
	};
}

/** @internal */
export async function __saveDesignBriefHandler(args: {
	userId: string;
	supabase: SupabaseScoped;
	input: SaveDesignBriefInput;
}) {
	const stylePreset = findStylePreset(
		await __resolveTaskStyle(args.supabase, args.userId, args.input.taskId)
	);
	const prompt = buildDesignPrompt({
		taskTitle: args.input.taskTitle,
		styleRules: args.input.styleRules,
		briefMarkdown: args.input.markdown,
		protectedElements: args.input.protectedElements,
		roomObjects: args.input.roomObjects,
		referencePhotoName: args.input.referencePhotoName,
		supportingPhotoCount: args.input.supportingPhotoCount,
		stylePreset,
	});
	const { data, error } = await args.supabase
		.from("design_briefs")
		.insert({
			owner_id: args.userId,
			task_id: args.input.taskId,
			style_rules: args.input.styleRules,
			markdown: args.input.markdown,
			prompt,
		})
		.select("id, markdown, prompt, version")
		.single();
	if (error) throw wrapSupabaseError(error);

	return {
		id: String(data.id),
		markdown: String(data.markdown),
		prompt: String(data.prompt),
		version: Number(data.version),
	};
}

export type GeneratedImagePayload = {
	id: string;
	storagePath: string;
	signedUrl: string;
	variationIndex: number;
	isFavorite: boolean;
	/** Vision-derived furniture/decor list, null until described. */
	contents: string[] | null;
};

/**
 * The `generated_images.notes` column stores the room-contents list as a
 * JSON string array. Anything else (legacy free text, corrupt data) reads
 * back as null so the UI simply re-describes the image.
 */
function parseContentsNotes(notes: unknown): string[] | null {
	if (typeof notes !== "string" || notes.length === 0) return null;
	try {
		const parsed: unknown = JSON.parse(notes);
		if (
			Array.isArray(parsed) &&
			parsed.every((entry) => typeof entry === "string")
		) {
			return parsed;
		}
		return null;
	} catch {
		return null;
	}
}

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

	// The approved Room Composite is the preferred generation source: a single
	// wide (3:2) view of the whole captured room. It takes precedence over a
	// single reference photo. A provided id must load or we fail loudly rather
	// than silently dropping the user's chosen source geometry.
	const compositeImage = args.input.compositeId
		? await loadCompositeImage({
				supabase: args.supabase,
				userId: args.userId,
				compositeId: args.input.compositeId,
			})
		: undefined;
	if (args.input.compositeId && !compositeImage) {
		throw new Error("Room composite not found or unavailable");
	}

	// Fall back to a single source photo only when no composite was supplied
	// (legacy/text callers). Missing both is an intentional text-only request.
	const photoImage =
		!compositeImage && args.input.photoId
			? await loadSourcePhoto({
					supabase: args.supabase,
					userId: args.userId,
					photoId: args.input.photoId,
				})
			: undefined;
	if (!compositeImage && args.input.photoId && !photoImage) {
		throw new Error("Source photo not found or unavailable");
	}

	const sourceImage = compositeImage ?? photoImage;
	// Preserve the composite's 3:2 ratio; let the model choose for a single photo.
	const outputSize = compositeImage
		? ("1536x1024" as const)
		: ("auto" as const);

	// Furniture references ride along as extra input images on the same edit
	// call, so they only make sense when a source photo anchors the room.
	const furnitureItemIds = args.input.furnitureItemIds ?? [];
	if (furnitureItemIds.length > 0 && !sourceImage) {
		throw new Error("Furniture references require a source photo");
	}
	const furnitureReferences =
		furnitureItemIds.length > 0
			? await loadFurnitureReferences({
					supabase: args.supabase,
					userId: args.userId,
					furnitureItemIds,
				})
			: [];

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
		const furnitureSection = buildFurnitureReferenceSection(
			furnitureReferences.map((reference) => ({
				label: reference.label,
				widthCm: reference.widthCm,
				heightCm: reference.heightCm,
				depthCm: reference.depthCm,
			}))
		);
		const prompts = buildConceptVariationPrompts(
			args.input.prompt,
			clampedCount
		).map((prompt) =>
			furnitureSection ? `${prompt}\n\n${furnitureSection}` : prompt
		);
		const providerResult = await args.provider.generateRenovationImages({
			sourceImage,
			referenceImages:
				furnitureReferences.length > 0 ? furnitureReferences : undefined,
			prompts,
			outputSize,
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
				contents: null,
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

/**
 * Return the most recent batch of generated images for a task. "Most recent
 * batch" means all images sharing the `job_id` of the newest succeeded
 * generation job — so reopening the workspace shows the same grid the user
 * last saw instead of re-running the provider on every visit.
 */
/** @internal */
export async function __listGeneratedImagesHandler(args: {
	userId: string;
	supabase: SupabaseScoped;
	input: ListGeneratedImagesInput;
}): Promise<{ jobId: string | null; images: GeneratedImagePayload[] }> {
	let jobQuery = args.supabase
		.from("generation_jobs")
		.select("id")
		.eq("task_id", args.input.taskId)
		.eq("owner_id", args.userId)
		.eq("status", "succeeded");
	jobQuery = args.input.jobId
		? jobQuery.eq("id", args.input.jobId)
		: jobQuery
				.order("completed_at", { ascending: false })
				.order("created_at", { ascending: false });
	const job = await jobQuery.limit(1).maybeSingle();
	if (job.error) throw wrapSupabaseError(job.error);
	if (!job.data) return { jobId: null, images: [] };

	const rows = await args.supabase
		.from("generated_images")
		.select(
			"id, storage_bucket, storage_path, variation_index, is_favorite, notes"
		)
		.eq("job_id", job.data.id)
		.eq("owner_id", args.userId)
		.order("variation_index", { ascending: true });
	if (rows.error) throw wrapSupabaseError(rows.error);

	const images: GeneratedImagePayload[] = [];
	for (const row of rows.data ?? []) {
		const signed = await args.supabase.storage
			.from(String(row.storage_bucket))
			.createSignedUrl(String(row.storage_path), SIGNED_URL_TTL_SECONDS);
		if (signed.error || !signed.data?.signedUrl) continue;
		images.push({
			id: String(row.id),
			storagePath: String(row.storage_path),
			signedUrl: signed.data.signedUrl,
			variationIndex: Number(row.variation_index),
			isFavorite: Boolean(row.is_favorite),
			contents: parseContentsNotes(row.notes),
		});
	}

	return { jobId: String(job.data.id), images };
}

/**
 * Vision pass over a generation batch: every image without a persisted
 * contents list gets one (stored as a JSON array in `notes`), and the full
 * id → contents map for the batch is returned. Per-image provider failures
 * are skipped rather than failing the batch — the UI can retry by calling
 * again.
 */
/** @internal */
export async function __describeGeneratedImagesHandler(args: {
	userId: string;
	supabase: SupabaseScoped;
	provider: RenovationAiProvider;
	input: DescribeGeneratedImagesInput;
}): Promise<{ contents: Record<string, string[]> }> {
	const rows = await args.supabase
		.from("generated_images")
		.select("id, storage_bucket, storage_path, notes")
		.eq("job_id", args.input.jobId)
		.eq("task_id", args.input.taskId)
		.eq("owner_id", args.userId)
		.order("variation_index", { ascending: true });
	if (rows.error) throw wrapSupabaseError(rows.error);

	const contents: Record<string, string[]> = {};
	for (const row of rows.data ?? []) {
		const existing = parseContentsNotes(row.notes);
		if (existing) {
			contents[String(row.id)] = existing;
			continue;
		}

		const signed = await args.supabase.storage
			.from(String(row.storage_bucket))
			.createSignedUrl(String(row.storage_path), SIGNED_URL_TTL_SECONDS);
		if (signed.error || !signed.data?.signedUrl) continue;

		try {
			const result = await args.provider.listRoomContents({
				imageUrl: signed.data.signedUrl,
			});
			const updated = await args.supabase
				.from("generated_images")
				.update({ notes: JSON.stringify(result.value) })
				.eq("id", row.id)
				.eq("owner_id", args.userId);
			if (updated.error) throw wrapSupabaseError(updated.error);
			contents[String(row.id)] = result.value;
		} catch (err) {
			console.error("listRoomContents failed for image", row.id, err);
		}
	}

	return { contents };
}

/**
 * Every succeeded generation batch for a task, newest first. `version` is
 * the chronological batch number (oldest = 1) so the UI can label history
 * entries stably even as new batches are added.
 */
/** @internal */
export async function __listGenerationJobsHandler(args: {
	userId: string;
	supabase: SupabaseScoped;
	input: ListGenerationJobsInput;
}): Promise<{
	jobs: Array<{ id: string; version: number; createdAt: string }>;
}> {
	const rows = await args.supabase
		.from("generation_jobs")
		.select("id, created_at")
		.eq("task_id", args.input.taskId)
		.eq("owner_id", args.userId)
		.eq("status", "succeeded")
		.order("created_at", { ascending: true });
	if (rows.error) throw wrapSupabaseError(rows.error);

	return {
		jobs: (rows.data ?? [])
			.map((row, index) => ({
				id: String(row.id),
				version: index + 1,
				createdAt: String(row.created_at),
			}))
			.reverse(),
	};
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

export type FavoriteImagePayload = {
	id: string;
	signedUrl: string;
	variationIndex: number;
	/** Vision-derived furniture/decor list, null until described. */
	contents: string[] | null;
	createdAt: string;
	taskId: string;
	taskTitle: string;
	projectId: string;
	projectName: string;
};

/**
 * Every favorited image across the user's projects, newest first. Joins
 * through `renovation_tasks` to `projects` so the favorites page can label
 * each image with its project without extra round-trips. Images whose
 * signed URL fails to mint are skipped, matching `listGeneratedImages`.
 */
/** @internal */
export async function __listFavoriteImagesHandler(args: {
	userId: string;
	supabase: SupabaseScoped;
}): Promise<{ images: FavoriteImagePayload[] }> {
	const rows = await args.supabase
		.from("generated_images")
		.select(
			"id, storage_bucket, storage_path, variation_index, notes, created_at, renovation_tasks(id, title, projects(id, name))"
		)
		.eq("owner_id", args.userId)
		.eq("is_favorite", true)
		.order("created_at", { ascending: false });
	if (rows.error) throw wrapSupabaseError(rows.error);

	const images: FavoriteImagePayload[] = [];
	for (const row of rows.data ?? []) {
		const task = row.renovation_tasks;
		const project = task?.projects;
		if (!(task && project)) continue;
		const signed = await args.supabase.storage
			.from(String(row.storage_bucket))
			.createSignedUrl(String(row.storage_path), SIGNED_URL_TTL_SECONDS);
		if (signed.error || !signed.data?.signedUrl) continue;
		images.push({
			id: String(row.id),
			signedUrl: signed.data.signedUrl,
			variationIndex: Number(row.variation_index),
			contents: parseContentsNotes(row.notes),
			createdAt: String(row.created_at),
			taskId: String(task.id),
			taskTitle: String(task.title),
			projectId: String(project.id),
			projectName: String(project.name),
		});
	}

	return { images };
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
	const replaced = await args.supabase.rpc("replace_protected_elements", {
		p_task_id: args.input.taskId,
		p_photo_id: args.input.photoId,
		p_elements: args.input.elements,
	});
	if (replaced.error) throw wrapSupabaseError(replaced.error);
	return (replaced.data ?? []) as ProtectedElementRow[];
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

	const buffer = Buffer.from(await download.data.arrayBuffer());
	const normalized = await normalizeImageToPng(buffer);
	if (normalized) {
		return {
			base64: normalized.toString("base64"),
			contentType: "image/png" as const,
			filename: "source.png",
		};
	}

	const contentType = EDITABLE_IMAGE_TYPES.has(row.data.content_type)
		? (row.data.content_type as "image/png" | "image/jpeg" | "image/webp")
		: "image/png";
	return {
		base64: buffer.toString("base64"),
		contentType,
		filename: row.data.original_name || "source.png",
	};
}

/**
 * Download the approved Room Composite's bytes for image-edit mode. Like
 * `loadSourcePhoto`, returns `undefined` when the row or object can't be read
 * so the caller can decide how to fail.
 */
async function loadCompositeImage(args: {
	supabase: SupabaseScoped;
	userId: string;
	compositeId: string;
}): Promise<
	| {
			base64: string;
			contentType: "image/png" | "image/jpeg" | "image/webp";
			filename: string;
	  }
	| undefined
> {
	const row = await args.supabase
		.from("room_composites")
		.select("storage_bucket, storage_path")
		.eq("id", args.compositeId)
		.eq("owner_id", args.userId)
		.maybeSingle();
	if (row.error || !row.data) return;

	const download = await args.supabase.storage
		.from(row.data.storage_bucket)
		.download(row.data.storage_path);
	if (download.error || !download.data) return;

	const buffer = Buffer.from(await download.data.arrayBuffer());
	const normalized = await normalizeImageToPng(buffer);
	return {
		base64: (normalized ?? buffer).toString("base64"),
		contentType: "image/png" as const,
		filename: "composite.png",
	};
}

/**
 * Load the bytes for the selected furniture reference items. Every requested
 * id must resolve to an owned row with downloadable bytes — a silently
 * dropped reference would produce a generation that looks successful while
 * missing furniture the user explicitly selected.
 */
async function loadFurnitureReferences(args: {
	supabase: SupabaseScoped;
	userId: string;
	furnitureItemIds: string[];
}): Promise<
	Array<{
		base64: string;
		contentType: "image/png" | "image/jpeg" | "image/webp";
		filename: string;
		label: string;
		widthCm: number | null;
		heightCm: number | null;
		depthCm: number | null;
	}>
> {
	const rows = await args.supabase
		.from("furniture_items")
		.select("id, label, width_cm, height_cm, depth_cm")
		.in("id", args.furnitureItemIds)
		.eq("owner_id", args.userId);
	if (rows.error) throw wrapSupabaseError(rows.error);
	if ((rows.data ?? []).length !== args.furnitureItemIds.length) {
		throw new Error("Furniture item not found");
	}

	// The Reference Image is each item's active Furniture Photo.
	const images = await args.supabase
		.from("furniture_item_images")
		.select("furniture_item_id, storage_bucket, storage_path, content_type")
		.in("furniture_item_id", args.furnitureItemIds)
		.eq("owner_id", args.userId)
		.eq("is_active", true);
	if (images.error) throw wrapSupabaseError(images.error);
	const activeImageByItemId = new Map(
		(images.data ?? []).map((image) => [String(image.furniture_item_id), image])
	);

	const rowById = new Map(
		(rows.data ?? []).map((row) => [String(row.id), row])
	);
	const references: Array<{
		base64: string;
		contentType: "image/png" | "image/jpeg" | "image/webp";
		filename: string;
		label: string;
		widthCm: number | null;
		heightCm: number | null;
		depthCm: number | null;
	}> = [];
	for (const furnitureItemId of args.furnitureItemIds) {
		const row = rowById.get(furnitureItemId);
		if (!row) throw new Error("Furniture item not found");
		const image = activeImageByItemId.get(furnitureItemId);
		if (!image) throw new Error("Furniture item not found");
		const download = await args.supabase.storage
			.from(image.storage_bucket)
			.download(image.storage_path);
		if (download.error || !download.data) {
			throw new Error(`Furniture image unavailable: ${row.label}`);
		}
		const buffer = Buffer.from(await download.data.arrayBuffer());
		const normalized = await normalizeImageToPng(buffer);
		const contentType = normalized
			? ("image/png" as const)
			: EDITABLE_IMAGE_TYPES.has(image.content_type)
				? (image.content_type as "image/png" | "image/jpeg" | "image/webp")
				: "image/png";
		references.push({
			base64: (normalized ?? buffer).toString("base64"),
			contentType,
			filename: `furniture-${references.length + 1}.png`,
			label: String(row.label),
			widthCm: row.width_cm == null ? null : Number(row.width_cm),
			heightCm: row.height_cm == null ? null : Number(row.height_cm),
			depthCm: row.depth_cm == null ? null : Number(row.depth_cm),
		});
	}
	return references;
}

export const detectProtectedElements = createServerFn({ method: "POST" })
	.validator(detectProtectedElementsSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __detectProtectedElementsHandler({
			userId,
			supabase,
			provider: getRenovationAiProvider(),
			input: data,
		});
	});

export const createDesignBrief = createServerFn({ method: "POST" })
	.validator(createDesignBriefSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __createDesignBriefHandler({
			userId,
			supabase,
			provider: getRenovationAiProvider(),
			input: data,
		});
	});

export const loadLatestDesignBrief = createServerFn({ method: "POST" })
	.validator(loadLatestDesignBriefSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __loadLatestDesignBriefHandler({ userId, supabase, input: data });
	});

export const saveDesignBrief = createServerFn({ method: "POST" })
	.validator(saveDesignBriefSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __saveDesignBriefHandler({
			userId,
			supabase,
			input: data,
		});
	});

export const generateRenovationImages = createServerFn({ method: "POST" })
	.validator(generateRenovationImagesSchema)
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

export const listGeneratedImages = createServerFn({ method: "POST" })
	.validator(listGeneratedImagesSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __listGeneratedImagesHandler({ userId, supabase, input: data });
	});

export const listGenerationJobs = createServerFn({ method: "POST" })
	.validator(listGenerationJobsSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __listGenerationJobsHandler({ userId, supabase, input: data });
	});

export const describeGeneratedImages = createServerFn({ method: "POST" })
	.validator(describeGeneratedImagesSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __describeGeneratedImagesHandler({
			userId,
			supabase,
			provider: getRenovationAiProvider(),
			input: data,
		});
	});

export const setImageFavorite = createServerFn({ method: "POST" })
	.validator(setImageFavoriteSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __setImageFavoriteHandler({ userId, supabase, input: data });
	});

export const listFavoriteImages = createServerFn({ method: "GET" }).handler(
	async () => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __listFavoriteImagesHandler({ userId, supabase });
	}
);

export const listProtectedElements = createServerFn({ method: "POST" })
	.validator(listProtectedElementsSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __listProtectedElementsHandler({ userId, supabase, input: data });
	});

export const saveDetectedElements = createServerFn({ method: "POST" })
	.validator(saveDetectedElementsSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __saveDetectedElementsHandler({ userId, supabase, input: data });
	});

export const updateProtectedElementStatus = createServerFn({ method: "POST" })
	.validator(updateProtectedElementStatusSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __updateProtectedElementStatusHandler({
			userId,
			supabase,
			input: data,
		});
	});
