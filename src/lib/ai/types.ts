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
};
