import type { RoomObject } from "../renovation/room-state";

export type BoundingBox = {
	label: string;
	kind:
		| "window"
		| "door"
		| "radiator"
		| "stairs"
		| "ceiling_line"
		| "wall_edge"
		| "structure"
		| "column_beam"
		| "built_in"
		| "other";
	x: number;
	y: number;
	width: number;
	height: number;
	confidence?: number;
};

export type SuggestTasksInput = {
	projectNotes: string;
	photos: Array<{ id: string; signedUrl: string; notes?: string }>;
	model?: ModelSelection;
};

export type SuggestedTask = {
	title: string;
	category: string;
	rationale: string;
};

import type { ModelSelection } from "./models";

export type DetectProtectedElementsInput = {
	photoUrl: string;
	taskTitle: string;
	notes?: string;
	/** Optional explicit model. Defaults applied in the provider when omitted. */
	model?: ModelSelection;
};

export type CreateDesignBriefInput = {
	taskTitle: string;
	styleRules: string;
	protectedElements: BoundingBox[];
	roomObjects?: RoomObject[];
	referencePhotoName?: string;
	supportingPhotoCount?: number;
	model?: ModelSelection;
};

export type GenerateRenovationImagesInput = {
	/**
	 * Source photo bytes. When provided, the provider uses image-edit mode so
	 * the output preserves the room's geometry. Omit to fall back to pure
	 * text-to-image.
	 */
	sourceImage?: {
		base64: string;
		contentType: "image/png" | "image/jpeg" | "image/webp";
		filename: string;
	};
	/**
	 * Furniture reference images that ride along with the source photo in
	 * image-edit mode. Each shows one furniture piece that must appear in the
	 * output; the prompt explains how the model should treat them. Ignored in
	 * pure text-to-image mode (no `sourceImage`).
	 */
	referenceImages?: Array<{
		base64: string;
		contentType: "image/png" | "image/jpeg" | "image/webp";
		filename: string;
		label: string;
	}>;
	/**
	 * One prompt per variation. The provider produces exactly
	 * `prompts.length` images, one per entry. Callers expand a single base
	 * prompt into N concept-specific prompts via
	 * `buildConceptVariationPrompts` so each variation can be a different
	 * room concept while sharing the same architectural rules.
	 */
	prompts: string[];
};

export type GeneratedImageResult = {
	base64: string;
	contentType: "image/png" | "image/jpeg" | "image/webp";
};

/**
 * Inputs for `listRoomContents` — a vision pass over one generated variation
 * that names every visible furniture/decor item so the UI can show a
 * contents list under the image.
 */
export type ListRoomContentsInput = {
	imageUrl: string;
	model?: ModelSelection;
};

/**
 * Three furniture dimensions in centimetres. Each is nullable because a
 * product page may expose some, all, or none of them — the AI pass fills only
 * what the structured markup missed and the user remains the correctness gate
 * in the confirm form.
 */
export type FurnitureDimensions = {
	widthCm: number | null;
	heightCm: number | null;
	depthCm: number | null;
};

/**
 * Inputs for `extractFurnitureDimensions` — a text-only pass over a product
 * page's stripped body text that recovers W×H×D when the structured markup
 * (JSON-LD) didn't carry them. No images: dimensions live in prose and spec
 * tables, not photos. Verified during design that neither Jysk nor IKEA ships
 * structured dimensions, so this is the only automated path to sizes.
 */
export type ExtractFurnitureDimensionsInput = {
	/** Plain-text product page body, HTML already stripped. */
	pageText: string;
	/** Product name, when known, to anchor the model on the right item. */
	productName?: string | null;
	model?: ModelSelection;
};

/**
 * Debug payload attached to provider responses when running outside production.
 *
 * The server function decides whether to forward this to the client based on
 * `NODE_ENV` — providers populate it unconditionally so the gating logic lives
 * in one place (the server fn) rather than scattered across providers.
 */
export type ProviderDebug = {
	model: string;
	prompt: string;
	rawResponse: string;
	durationMs: number;
};

/**
 * Wrapper for every provider call result. The `debug` field is optional so
 * cheap/synchronous providers (e.g. the mock) can skip populating it. The
 * server functions surface `debug` to the UI only in dev builds.
 */
export type ProviderResult<T> = {
	value: T;
	debug?: ProviderDebug;
};

export type RenovationAiProvider = {
	suggestTasks(
		input: SuggestTasksInput
	): Promise<ProviderResult<SuggestedTask[]>>;
	detectProtectedElements(
		input: DetectProtectedElementsInput
	): Promise<ProviderResult<BoundingBox[]>>;
	createDesignBrief(
		input: CreateDesignBriefInput
	): Promise<ProviderResult<{ markdown: string; prompt: string }>>;
	generateRenovationImages(
		input: GenerateRenovationImagesInput
	): Promise<ProviderResult<GeneratedImageResult[]>>;
	listRoomContents(
		input: ListRoomContentsInput
	): Promise<ProviderResult<string[]>>;
	extractFurnitureDimensions(
		input: ExtractFurnitureDimensionsInput
	): Promise<ProviderResult<FurnitureDimensions>>;
};
