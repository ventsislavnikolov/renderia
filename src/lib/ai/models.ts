/**
 * Catalog of AI models the user can pick per AI action.
 *
 * Source of truth for both the server-side provider dispatch and the client
 * `<ModelPicker />` chip. Keeping it as a const object (not derived from the
 * SDK) lets the UI render cost hints + free-tier flags without bundling the
 * SDK packages into the client bundle.
 *
 * NOTE: image generation only supports OpenAI's gpt-image-2 today. Gemini
 * and Anthropic don't yet ship a photo-realistic interior renderer that
 * matches gpt-image-2's quality, so we keep that capability single-provider.
 */

export type AiProviderId =
	| "openai"
	| "google"
	| "anthropic"
	| "zai"
	| "moonshot"
	| "mock";

/**
 * `kind` mirrors the broad capability the model is used for. Each model
 * declares which kinds it can serve; the picker filters by the calling
 * site's kind so the UI never shows e.g. a brief-only model on the
 * detection picker.
 */
export type ModelKind = "text-vision" | "image";

export type ModelEntry = {
	id: string;
	provider: AiProviderId;
	label: string;
	kinds: ModelKind[];
	freeTier: boolean;
	envVar?: string;
	notes?: string;
};

export const MODEL_CATALOG: readonly ModelEntry[] = [
	// OpenAI
	{
		id: "gpt-5.5",
		provider: "openai",
		label: "GPT-5.5",
		kinds: ["text-vision"],
		freeTier: false,
		envVar: "OPENAI_API_KEY",
	},
	{
		id: "gpt-5.4",
		provider: "openai",
		label: "GPT-5.4",
		kinds: ["text-vision"],
		freeTier: false,
		envVar: "OPENAI_API_KEY",
	},
	{
		id: "gpt-5.4-mini",
		provider: "openai",
		label: "GPT-5.4 mini",
		kinds: ["text-vision"],
		freeTier: false,
		envVar: "OPENAI_API_KEY",
		notes: "Faster + cheaper; weaker at long instructions.",
	},
	{
		id: "gpt-image-2",
		provider: "openai",
		label: "gpt-image-2",
		kinds: ["image"],
		freeTier: false,
		envVar: "OPENAI_API_KEY",
	},

	// Google
	{
		id: "gemini-2.5-flash",
		provider: "google",
		label: "Gemini 2.5 Flash",
		kinds: ["text-vision"],
		freeTier: true,
		envVar: "GEMINI_API_KEY",
		notes: "Generous free tier (~1500 req/day).",
	},
	{
		id: "gemini-2.0-flash",
		provider: "google",
		label: "Gemini 2.0 Flash",
		kinds: ["text-vision"],
		freeTier: true,
		envVar: "GEMINI_API_KEY",
	},

	// Anthropic
	{
		id: "claude-haiku-4-5",
		provider: "anthropic",
		label: "Claude Haiku 4.5",
		kinds: ["text-vision"],
		freeTier: false,
		envVar: "ANTHROPIC_API_KEY",
		notes: "~5× cheaper than GPT-5 for the same prompt size.",
	},
	{
		id: "claude-sonnet-4-6",
		provider: "anthropic",
		label: "Claude Sonnet 4.6",
		kinds: ["text-vision"],
		freeTier: false,
		envVar: "ANTHROPIC_API_KEY",
	},

	// Z.AI (Zhipu) — OpenAI-compatible endpoint. Models marked `text-vision`
	// support multimodal input via the same content-parts shape OpenAI uses.
	{
		id: "glm-4.5",
		provider: "zai",
		label: "GLM-4.5",
		kinds: ["text-vision"],
		freeTier: false,
		envVar: "ZAI_API_KEY",
		notes: "Z.AI flagship; competitive with GPT-5 at a fraction of the cost.",
	},
	{
		id: "glm-4.5-air",
		provider: "zai",
		label: "GLM-4.5 Air",
		kinds: ["text-vision"],
		freeTier: false,
		envVar: "ZAI_API_KEY",
		notes: "Faster + cheaper than GLM-4.5.",
	},
	{
		id: "glm-4v-plus",
		provider: "zai",
		label: "GLM-4V Plus",
		kinds: ["text-vision"],
		freeTier: false,
		envVar: "ZAI_API_KEY",
		notes: "Vision-tuned variant.",
	},

	// Moonshot (Kimi) — OpenAI-compatible endpoint. Vision variants are
	// suffixed `-vision-preview`; the K2 flagship is multimodal natively.
	{
		id: "kimi-k2-0905-preview",
		provider: "moonshot",
		label: "Kimi K2",
		kinds: ["text-vision"],
		freeTier: false,
		envVar: "MOONSHOT_API_KEY",
		notes: "Moonshot's flagship — strong instruction following, long context.",
	},
	{
		id: "moonshot-v1-32k-vision-preview",
		provider: "moonshot",
		label: "Moonshot v1 32k (vision)",
		kinds: ["text-vision"],
		freeTier: false,
		envVar: "MOONSHOT_API_KEY",
	},
	{
		id: "moonshot-v1-128k-vision-preview",
		provider: "moonshot",
		label: "Moonshot v1 128k (vision)",
		kinds: ["text-vision"],
		freeTier: false,
		envVar: "MOONSHOT_API_KEY",
		notes: "128k context — overkill for detection but good for long briefs.",
	},
] as const;

export type ModelSelection = {
	provider: AiProviderId;
	model: string;
};

/**
 * Defaults used when the caller doesn't pass an explicit choice. The text
 * default points at the cheapest free model so unattended cron jobs / tests
 * don't burn paid credits unexpectedly.
 */
export const DEFAULT_TEXT_MODEL: ModelSelection = {
	provider: "google",
	model: "gemini-2.5-flash",
};

export const DEFAULT_IMAGE_MODEL: ModelSelection = {
	provider: "openai",
	model: "gpt-image-2",
};

export function findModel(selection: ModelSelection): ModelEntry | undefined {
	return MODEL_CATALOG.find(
		(entry) =>
			entry.provider === selection.provider && entry.id === selection.model
	);
}

export function modelsForKind(kind: ModelKind): readonly ModelEntry[] {
	return MODEL_CATALOG.filter((entry) => entry.kinds.includes(kind));
}
