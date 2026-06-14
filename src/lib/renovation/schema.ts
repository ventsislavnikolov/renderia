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
			"radiator",
			"stairs",
			"ceiling_line",
			"wall_edge",
			"structure",
			"column_beam",
			"built_in",
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

export const roomElementKindSchema = z.enum([
	"window",
	"door",
	"radiator",
	"stairs",
	"ceiling_line",
	"wall_edge",
	"structure",
	"column_beam",
	"built_in",
	"other",
]);
export type RoomElementKindInput = z.infer<typeof roomElementKindSchema>;

export const preservationModeSchema = z.enum([
	"exact_preserve",
	"keep_type_restyle",
]);
export type PreservationModeInput = z.infer<typeof preservationModeSchema>;

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

export const deletePhotoSchema = z.object({
	projectId: z.string().uuid(),
	taskId: z.string().uuid(),
	photoId: z.string().uuid(),
});
export type DeletePhotoInput = z.infer<typeof deletePhotoSchema>;

/**
 * Furniture reference images: the account-wide library of furniture pieces
 * the user wants the AI to include in generated variations. Items belong to
 * the owner, not a project — any item can be attached to any task. The
 * browser uploads the (optionally cropped) image to the
 * `furniture-references` bucket first, then registers it here.
 */
/**
 * Optional Link-Import metadata shared by create and (the dimension subset of)
 * update. Every field is nullable: manual add supplies none of them, Link
 * Import fills whatever the product page exposed, and the user may clear any
 * of them in the edit form. A non-null `sourceLink` is what marks an item as
 * link-imported.
 */
const sourceLinkField = z.string().url().max(2048).nullish();
const brandField = z.string().min(1).max(120).nullish();
const priceField = z.number().nonnegative().finite().nullish();
const currencyField = z.string().min(1).max(8).nullish();
const dimensionField = z.number().positive().finite().nullish();

export const createFurnitureItemSchema = z.object({
	storagePath: z
		.string()
		.min(1)
		.max(512)
		.regex(/^[a-f0-9-]+\/[A-Za-z0-9._-]+$/),
	originalName: z.string().min(1).max(255),
	contentType: z.string().regex(/^image\/(png|jpeg|webp)$/),
	label: z.string().min(1).max(120),
	source: z.enum(["product", "photo"]),
	sourceLink: sourceLinkField,
	brand: brandField,
	price: priceField,
	currency: currencyField,
	widthCm: dimensionField,
	heightCm: dimensionField,
	depthCm: dimensionField,
});
export type CreateFurnitureItemInput = z.infer<
	typeof createFurnitureItemSchema
>;

/**
 * Edit an existing item's user-correctable fields: its label and the three
 * dimensions. Dimensions are nullable so the user can clear a wrong import.
 */
export const updateFurnitureItemSchema = z.object({
	furnitureItemId: z.string().uuid(),
	label: z.string().min(1).max(120),
	widthCm: z.number().positive().finite().nullable(),
	heightCm: z.number().positive().finite().nullable(),
	depthCm: z.number().positive().finite().nullable(),
});
export type UpdateFurnitureItemInput = z.infer<
	typeof updateFurnitureItemSchema
>;

export const listFurnitureItemsSchema = z.object({
	// When provided, the response marks which items are selected for this task.
	taskId: z.string().uuid().nullable().optional(),
});
export type ListFurnitureItemsInput = z.infer<typeof listFurnitureItemsSchema>;

export const deleteFurnitureItemSchema = z.object({
	furnitureItemId: z.string().uuid(),
});
export type DeleteFurnitureItemInput = z.infer<
	typeof deleteFurnitureItemSchema
>;

/**
 * Multi-photo furniture (PRD: multi-photo-furniture). A Furniture Item carries
 * 1–6 Furniture Photos; exactly one is the active Reference Image. The cap is a
 * soft product limit enforced server-side on every add path (edit-dialog add
 * and Link Import) and mirrored client-side (the add control disables at 6).
 */
export const MAX_FURNITURE_PHOTOS = 6;

/**
 * Inputs for `addFurniturePhoto` — register a new Furniture Photo on an
 * existing item. The browser has already uploaded the (cropped) image to the
 * `furniture-references` bucket, same as manual add; this only inserts the
 * metadata row. The new photo is never active — the existing Reference Image
 * stays put until the user explicitly switches it.
 */
export const addFurniturePhotoSchema = z.object({
	furnitureItemId: z.string().uuid(),
	storagePath: z
		.string()
		.min(1)
		.max(512)
		.regex(/^[a-f0-9-]+\/[A-Za-z0-9._-]+$/),
	originalName: z.string().min(1).max(255),
	contentType: z.string().regex(/^image\/(png|jpeg|webp)$/),
	source: z.enum(["product", "photo"]),
});
export type AddFurniturePhotoInput = z.infer<typeof addFurniturePhotoSchema>;

/**
 * Inputs for `setActiveFurniturePhoto` — make the chosen photo the item's
 * active Reference Image, clearing whichever was active before.
 */
export const setActiveFurniturePhotoSchema = z.object({
	furnitureItemId: z.string().uuid(),
	photoId: z.string().uuid(),
});
export type SetActiveFurniturePhotoInput = z.infer<
	typeof setActiveFurniturePhotoSchema
>;

/**
 * Inputs for `deleteFurniturePhoto` — remove one Furniture Photo. Blocked when
 * it is the item's last photo; deleting the active photo promotes the oldest
 * remaining one so the item always keeps exactly one Reference Image.
 */
export const deleteFurniturePhotoSchema = z.object({
	furnitureItemId: z.string().uuid(),
	photoId: z.string().uuid(),
});
export type DeleteFurniturePhotoInput = z.infer<
	typeof deleteFurniturePhotoSchema
>;

/**
 * Inputs for `extractFurnitureCandidate` — the Link Import preview step.
 * Deliberately a plain bounded string: the handler parses the URL itself so
 * that an unusable link surfaces as its actionable "public http(s) product
 * pages" message instead of a generic validation error.
 */
export const extractFurnitureCandidateSchema = z.object({
	url: z.string().min(1).max(2048),
});
export type ExtractFurnitureCandidateInput = z.infer<
	typeof extractFurnitureCandidateSchema
>;

/**
 * Inputs for `importFurnitureItem` — the Link Import confirm step. The user
 * has edited the pre-filled form and chosen which extracted photos to keep
 * (1–6) plus which kept photo is the active Reference Image; the server
 * downloads each kept photo, normalises it, stores it in the furniture bucket,
 * and inserts the item with one `furniture_item_images` row per photo, exactly
 * one active.
 *
 * `sourceUrl` and `photoUrls` are plain bounded strings (not `z.string().url()`)
 * so the handler can parse them itself and surface the same actionable
 * "public http(s) product pages" message the extract step uses, instead of a
 * generic validation error. `activePhotoIndex` points into `photoUrls`.
 */
export const importFurnitureItemSchema = z
	.object({
		sourceUrl: z.string().min(1).max(2048),
		photoUrls: z
			.array(z.string().min(1).max(2048))
			.min(1)
			.max(MAX_FURNITURE_PHOTOS),
		activePhotoIndex: z.number().int().nonnegative(),
		label: z.string().min(1).max(120),
		brand: brandField,
		price: priceField,
		currency: currencyField,
		widthCm: dimensionField,
		heightCm: dimensionField,
		depthCm: dimensionField,
	})
	.refine((value) => value.activePhotoIndex < value.photoUrls.length, {
		message: "activePhotoIndex must point to a kept photo",
		path: ["activePhotoIndex"],
	});
export type ImportFurnitureItemInput = z.infer<
	typeof importFurnitureItemSchema
>;

export const MAX_FURNITURE_PER_GENERATION = 8;

export const setTaskFurnitureSchema = z.object({
	taskId: z.string().uuid(),
	furnitureItemIds: z
		.array(z.string().uuid())
		.max(MAX_FURNITURE_PER_GENERATION),
});
export type SetTaskFurnitureInput = z.infer<typeof setTaskFurnitureSchema>;

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

export const loadLatestDesignBriefSchema = z.object({
	taskId: z.string().uuid(),
});
export type LoadLatestDesignBriefInput = z.infer<
	typeof loadLatestDesignBriefSchema
>;

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
	/**
	 * Furniture reference items to include in the render. Requires `photoId`
	 * (image-edit mode) — the references ride along as extra input images.
	 */
	furnitureItemIds: z
		.array(z.string().uuid())
		.max(MAX_FURNITURE_PER_GENERATION)
		.optional(),
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
	// When provided, return that specific batch instead of the newest one so
	// the UI can browse generation history.
	jobId: z.string().uuid().nullable().optional(),
});
export type ListGeneratedImagesInput = z.infer<
	typeof listGeneratedImagesSchema
>;

/**
 * Inputs for `listGenerationJobs`. Returns every succeeded generation batch
 * for a task (newest first) so the UI can offer version history.
 */
export const listGenerationJobsSchema = z.object({
	taskId: z.string().uuid(),
});
export type ListGenerationJobsInput = z.infer<typeof listGenerationJobsSchema>;

/**
 * Inputs for `describeGeneratedImages`. Runs a vision pass over every image
 * in the batch that doesn't have a contents list yet, persists the lists,
 * and returns them all keyed by image id.
 */
export const describeGeneratedImagesSchema = z.object({
	taskId: z.string().uuid(),
	jobId: z.string().uuid(),
});
export type DescribeGeneratedImagesInput = z.infer<
	typeof describeGeneratedImagesSchema
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
			"radiator",
			"stairs",
			"ceiling_line",
			"wall_edge",
			"structure",
			"column_beam",
			"built_in",
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

export const roomAppearanceSchema = z
	.object({
		id: z.string().min(1).max(120),
		photoId: z.string().uuid(),
		label: z.string().min(1).max(120),
		kind: roomElementKindSchema,
		x: z.number().min(0).max(1),
		y: z.number().min(0).max(1),
		width: z.number().gt(0).max(1),
		height: z.number().gt(0).max(1),
		confidence: z.number().min(0).max(1).nullable(),
		source: z.enum(["ai", "manual"]),
		objectId: z.string().min(1).max(120).nullable(),
	})
	.refine((box) => box.x + box.width <= 1 && box.y + box.height <= 1, {
		message: "Room appearance box must fit inside image bounds",
	});
export type RoomAppearanceInput = z.infer<typeof roomAppearanceSchema>;

export const roomObjectSchema = z.object({
	id: z.string().min(1).max(120),
	label: z.string().min(1).max(120),
	kind: roomElementKindSchema,
	preservationMode: preservationModeSchema,
	appearanceIds: z.array(z.string().min(1).max(120)),
	isPersisted: z.boolean(),
});
export type RoomObjectInput = z.infer<typeof roomObjectSchema>;

export const createDesignBriefSchema = z.object({
	taskId: z.string().uuid(),
	taskTitle: z.string().min(1).max(200),
	styleRules: z.string().min(1).max(4000),
	protectedElements: z.array(protectedElementSchema),
	roomObjects: z.array(roomObjectSchema).optional(),
	referencePhotoName: z.string().max(255).optional(),
	supportingPhotoCount: z.number().int().min(1).max(4).optional(),
	model: modelSelectionSchema.optional(),
});
export type CreateDesignBriefInput = z.infer<typeof createDesignBriefSchema>;

export const saveDesignBriefSchema = z.object({
	taskId: z.string().uuid(),
	taskTitle: z.string().min(1).max(200),
	styleRules: z.string().min(1).max(4000),
	markdown: z.string().min(1).max(8000),
	protectedElements: z.array(protectedElementSchema),
	roomObjects: z.array(roomObjectSchema).optional(),
	referencePhotoName: z.string().max(255).optional(),
	supportingPhotoCount: z.number().int().min(1).max(4).optional(),
});
export type SaveDesignBriefInput = z.infer<typeof saveDesignBriefSchema>;

export const taskRoomStateSchema = z.object({
	photoIds: z.array(z.string().min(1).max(120)).min(1).max(4),
	reviewedPhotoIds: z.array(z.string().min(1).max(120)).max(4),
	referencePhotoId: z.string().min(1).max(120).nullable(),
	appearances: z.array(roomAppearanceSchema),
	objects: z.array(roomObjectSchema),
	previewApproved: z.boolean(),
});
export type TaskRoomStateInput = z.infer<typeof taskRoomStateSchema>;

export const createStructuralPreviewSchema = z.object({
	taskId: z.string().uuid(),
	taskTitle: z.string().min(1).max(200),
	referencePhotoId: z.string().uuid(),
	roomState: taskRoomStateSchema,
});
export type CreateStructuralPreviewInput = z.infer<
	typeof createStructuralPreviewSchema
>;

export const loadTaskRoomStateSchema = z.object({
	taskId: z.string().uuid(),
});
export type LoadTaskRoomStateInput = z.infer<typeof loadTaskRoomStateSchema>;

export const saveTaskRoomStateSchema = z.object({
	taskId: z.string().uuid(),
	roomState: taskRoomStateSchema,
});
export type SaveTaskRoomStateInput = z.infer<typeof saveTaskRoomStateSchema>;

export const approveStructuralPreviewSchema = z.object({
	taskId: z.string().uuid(),
	previewId: z.string().uuid(),
});
export type ApproveStructuralPreviewInput = z.infer<
	typeof approveStructuralPreviewSchema
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
