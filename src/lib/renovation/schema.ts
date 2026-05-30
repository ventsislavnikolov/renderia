import { z } from "zod";

/**
 * Shared Zod schemas for renovation server functions and tests.
 *
 * Each schema mirrors the database column constraints from
 * `supabase/migrations/0001_initial_schema.sql`. Keeping them centralised
 * means request validation and downstream tests reference the same shapes.
 *
 * String length caps are conservative defaults — they exist to keep
 * malformed or hostile payloads from reaching the database or the AI
 * provider, not to lock in product limits. Adjust per-column as the schema
 * evolves.
 */

export const createProjectSchema = z.object({
	name: z.string().min(1).max(200),
	description: z.string().max(2000).optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

/**
 * Inputs for the chat-prompt entry point. The user types a single free-form
 * renovation description (e.g. "renovate the attic into a Scandinavian
 * studio"); the handler derives a project name from the first sentence and
 * stores the full prompt as both the project description and the task title.
 */
export const createProjectFromPromptSchema = z.object({
	prompt: z.string().min(1).max(2000),
});
export type CreateProjectFromPromptInput = z.infer<
	typeof createProjectFromPromptSchema
>;

export const getProjectSchema = z.object({
	projectId: z.string().uuid(),
});
export type GetProjectInput = z.infer<typeof getProjectSchema>;

export const createTaskSchema = z.object({
	projectId: z.string().uuid(),
	title: z.string().min(1).max(200),
	category: z.string().min(1).max(200),
	notes: z.string().max(4000).optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const listTasksSchema = z.object({
	projectId: z.string().uuid(),
});
export type ListTasksInput = z.infer<typeof listTasksSchema>;

/**
 * Bounding box for a protected element. Coordinates and dimensions are
 * normalised to the 0..1 range relative to the photo so we can render the
 * same overlay across image sizes without re-running detection.
 */
export const protectedElementSchema = z
	.object({
		label: z.string().min(1).max(200),
		kind: z.enum([
			"window",
			"door",
			"stairs",
			"ceiling_line",
			"wall_edge",
			"structure",
			"other",
		]),
		x: z.number().min(0).max(1),
		y: z.number().min(0).max(1),
		width: z.number().gt(0).max(1),
		height: z.number().gt(0).max(1),
		confidence: z.number().optional(),
	})
	.refine((box) => box.x + box.width <= 1 && box.y + box.height <= 1, {
		message: "Protected element box must fit inside image bounds",
	});
export type ProtectedElementInput = z.infer<typeof protectedElementSchema>;

export const createPhotoSchema = z.object({
	projectId: z.string().uuid(),
	taskId: z.string().uuid(),
	// `user-id/filename` pattern — first segment is the owning user's UUID,
	// second segment is a safe filename. Rejects `..`, leading `/`, or any
	// other path-traversal shape that storage bucket policies wouldn't catch.
	storagePath: z
		.string()
		.min(1)
		.max(512)
		.regex(/^[a-f0-9-]+\/[A-Za-z0-9._-]+$/),
	originalName: z.string().min(1).max(255),
	contentType: z.string().regex(/^image\/(png|jpeg|webp)$/),
	notes: z.string().max(4000).optional(),
});
export type CreatePhotoInput = z.infer<typeof createPhotoSchema>;

export const listPhotosSchema = z.object({
	projectId: z.string().uuid(),
	taskId: z.string().uuid(),
});
export type ListPhotosInput = z.infer<typeof listPhotosSchema>;

/**
 * Optional per-call AI model selection. When omitted, the provider falls
 * back to its built-in default (currently Gemini 2.5 Flash for text — see
 * `DEFAULT_TEXT_MODEL` in `src/lib/ai/models.ts`). The schema is
 * intentionally permissive on the `model` string so we can add new SDK
 * model ids without a wire-level schema bump; the catalog in
 * `src/lib/ai/models.ts` is the human-facing source of truth.
 */
export const modelSelectionSchema = z.object({
	provider: z.enum([
		"openai",
		"google",
		"anthropic",
		"zai",
		"moonshot",
		"mock",
	]),
	model: z.string().min(1).max(120),
});
export type ModelSelectionInput = z.infer<typeof modelSelectionSchema>;

export const suggestTasksSchema = z.object({
	projectId: z.string().uuid(),
	projectNotes: z.string().max(4000).default(""),
	model: modelSelectionSchema.optional(),
});
export type SuggestTasksInput = z.infer<typeof suggestTasksSchema>;

export const detectProtectedElementsSchema = z.object({
	photoId: z.string().uuid(),
	taskId: z.string().uuid(),
	taskTitle: z.string().min(1).max(200),
	notes: z.string().max(4000).optional(),
	model: modelSelectionSchema.optional(),
});
export type DetectProtectedElementsInput = z.infer<
	typeof detectProtectedElementsSchema
>;

export const createDesignBriefSchema = z.object({
	taskId: z.string().uuid(),
	taskTitle: z.string().min(1).max(200),
	styleRules: z.string().min(1).max(4000),
	protectedElements: z.array(protectedElementSchema),
	model: modelSelectionSchema.optional(),
});
export type CreateDesignBriefInput = z.infer<typeof createDesignBriefSchema>;

export const loadLatestDesignBriefSchema = z.object({
	taskId: z.string().uuid(),
});
export type LoadLatestDesignBriefInput = z.infer<
	typeof loadLatestDesignBriefSchema
>;

export const saveDesignBriefSchema = z.object({
	taskId: z.string().uuid(),
	taskTitle: z.string().min(1).max(200),
	styleRules: z.string().min(1).max(4000),
	markdown: z.string().min(1).max(8000),
	protectedElements: z.array(protectedElementSchema),
});
export type SaveDesignBriefInput = z.infer<typeof saveDesignBriefSchema>;

/**
 * Inputs for `generateRenovationImages` server fn.
 *
 * `count` is capped at 4 so a single request can't burn an unbounded number
 * of `gpt-image-2` generations. `briefId` is nullable for manually edited
 * or legacy briefs that do not have a persisted `design_briefs` row yet.
 */
export const generateRenovationImagesSchema = z.object({
	taskId: z.string().uuid(),
	briefId: z.string().uuid().nullable(),
	prompt: z.string().min(1).max(8000),
	count: z.number().int().min(1).max(4).default(4),
	/**
	 * When set, the server loads the photo bytes from storage and the provider
	 * uses image-edit mode so the renovation preserves the source room.
	 */
	photoId: z.string().uuid().nullable().optional(),
});
export type GenerateRenovationImagesInput = z.infer<
	typeof generateRenovationImagesSchema
>;

/**
 * Inputs for `listGeneratedImages`. Returns the most recent batch of
 * `generated_images` for a task (newest job, by `created_at`). Used to
 * rehydrate the generation step on reopen instead of burning a new run.
 */
export const listGeneratedImagesSchema = z.object({
	taskId: z.string().uuid(),
});
export type ListGeneratedImagesInput = z.infer<
	typeof listGeneratedImagesSchema
>;

/**
 * Inputs for `setImageFavorite` server fn. The image id alone is enough —
 * the handler enforces ownership via the `owner_id` filter on the row.
 */
export const setImageFavoriteSchema = z.object({
	imageId: z.string().uuid(),
	isFavorite: z.boolean(),
});
export type SetImageFavoriteInput = z.infer<typeof setImageFavoriteSchema>;

/**
 * Bounding box schema for detection results that are persisted to the DB.
 *
 * This is the wire shape `saveDetectedElements` accepts and the basis for
 * each `protected_elements` row insert. Mirrors the column-level CHECKs in
 * `0001_initial_schema.sql`: width/height must be strictly positive,
 * coordinates and dimensions fit inside 0..1, confidence is nullable and
 * bounded to 0..1.
 *
 * Distinct from `protectedElementSchema` above (which is keyed `confidence:
 * optional`) because we want `null` to be an explicit "unknown" signal at
 * persistence time, not "field absent". The DB column is nullable too.
 */
export const detectedProtectedElementSchema = z
	.object({
		label: z.string().min(1).max(120),
		kind: z.enum([
			"window",
			"door",
			"stairs",
			"ceiling_line",
			"wall_edge",
			"structure",
			"other",
		]),
		x: z.number().min(0).max(1),
		y: z.number().min(0).max(1),
		width: z.number().gt(0).max(1),
		height: z.number().gt(0).max(1),
		confidence: z.number().min(0).max(1).nullable(),
	})
	.refine((box) => box.x + box.width <= 1 && box.y + box.height <= 1, {
		message: "Detected protected element box must fit inside image bounds",
	});
export type DetectedProtectedElementInput = z.infer<
	typeof detectedProtectedElementSchema
>;

/**
 * Inputs for `listProtectedElements`. Returns every persisted protected
 * element for a (task, photo) pair owned by the caller — used by the
 * overlay-confirm step on mount to avoid re-running detection after the
 * user navigates back.
 */
export const listProtectedElementsSchema = z.object({
	taskId: z.string().uuid(),
	photoId: z.string().uuid(),
});
export type ListProtectedElementsInput = z.infer<
	typeof listProtectedElementsSchema
>;

/**
 * Inputs for `saveDetectedElements`. The database derives `project_id` from
 * the owned task/photo pair inside an atomic RPC, so the client never sends
 * ownership-critical parent ids.
 */
export const saveDetectedElementsSchema = z.object({
	taskId: z.string().uuid(),
	photoId: z.string().uuid(),
	elements: z.array(detectedProtectedElementSchema),
});
export type SaveDetectedElementsInput = z.infer<
	typeof saveDetectedElementsSchema
>;

/**
 * Inputs for `updateProtectedElementStatus`. Used when the user toggles a
 * box selection in the overlay — flips `status` to 'confirmed' or
 * 'rejected' on the row already in the DB.
 */
export const updateProtectedElementStatusSchema = z.object({
	elementId: z.string().uuid(),
	status: z.enum(["confirmed", "rejected", "suggested"]),
});
export type UpdateProtectedElementStatusInput = z.infer<
	typeof updateProtectedElementStatusSchema
>;
