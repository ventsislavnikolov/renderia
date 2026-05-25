export type BoundingBox = {
	label: string;
	kind:
		| "window"
		| "door"
		| "stairs"
		| "ceiling_line"
		| "wall_edge"
		| "structure"
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
};

export type SuggestedTask = {
	title: string;
	category: string;
	rationale: string;
};

export type DetectProtectedElementsInput = {
	photoUrl: string;
	taskTitle: string;
	notes?: string;
};

export type CreateDesignBriefInput = {
	taskTitle: string;
	styleRules: string;
	protectedElements: BoundingBox[];
};

export type GenerateRenovationImagesInput = {
	sourceImageUrl: string;
	prompt: string;
	count: number;
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
		input: SuggestTasksInput,
	): Promise<ProviderResult<SuggestedTask[]>>;
	detectProtectedElements(
		input: DetectProtectedElementsInput,
	): Promise<ProviderResult<BoundingBox[]>>;
	createDesignBrief(
		input: CreateDesignBriefInput,
	): Promise<ProviderResult<{ markdown: string; prompt: string }>>;
	generateRenovationImages(
		input: GenerateRenovationImagesInput,
	): Promise<ProviderResult<GeneratedImageResult[]>>;
};
