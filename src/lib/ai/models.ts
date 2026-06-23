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
 * site's kind so the UI never shows e.g. a text-only model on the
 * detection (vision) picker.
 *
 * - `text-vision`: accepts images as input (detection, task suggestion,
 *   contents listing) and plain text.
 * - `text`: text-only — safe for prose tasks (e.g. dimension extraction) but
 *   NOT for any surface that attaches an image.
 * - `image`: image generation.
 */
export type ModelKind = "text-vision" | "image" | "text";

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

	// Google — the multimodal workhorse. Gemini ships a purpose-trained
	// `box_2d` grounding head, so even Flash returns tighter detection boxes
	// than GPT-class models, which lack native grounding (see the per-surface
	// note below). 2.5 Flash / 2.0 Flash were removed: 2.0 Flash is shut down,
	// 2.5 Flash is deprecated (EOL 2026-10-16, replaced by 3.5 Flash).
	{
		id: "gemini-3.5-flash",
		provider: "google",
		label: "Gemini 3.5 Flash",
		kinds: ["text-vision"],
		freeTier: true,
		envVar: "GEMINI_API_KEY",
		notes: "GA workhorse; native bounding-box grounding; free tier.",
	},
	{
		id: "gemini-3.1-pro-preview",
		provider: "google",
		label: "Gemini 3.1 Pro",
		kinds: ["text-vision"],
		freeTier: true,
		envVar: "GEMINI_API_KEY",
		notes: "Detection-precision escalation — tighter boxes than Flash.",
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

	// Z.AI (Zhipu) — OpenAI-compatible endpoint. GLM-4.5 / GLM-4.5 Air are
	// TEXT-ONLY (they cannot accept images); GLM-4.5V is the multimodal sibling.
	{
		id: "glm-4.5",
		provider: "zai",
		label: "GLM-4.5",
		kinds: ["text"],
		freeTier: false,
		envVar: "ZAI_API_KEY",
		notes: "Text-only flagship; competitive at a fraction of the cost.",
	},
	{
		id: "glm-4.5-air",
		provider: "zai",
		label: "GLM-4.5 Air",
		kinds: ["text"],
		freeTier: false,
		envVar: "ZAI_API_KEY",
		notes: "Text-only; faster + cheaper than GLM-4.5.",
	},
	{
		id: "glm-4.5v",
		provider: "zai",
		label: "GLM-4.5V",
		kinds: ["text-vision"],
		freeTier: false,
		envVar: "ZAI_API_KEY",
		notes: "Multimodal sibling with native grounding (replaces GLM-4V Plus).",
	},

	// Moonshot (Kimi) — OpenAI-compatible endpoint. The original K2 flagship is
	// TEXT-ONLY (vision arrived in later K2.5+); the `-vision-preview` models
	// below are multimodal.
	{
		id: "kimi-k2-0905-preview",
		provider: "moonshot",
		label: "Kimi K2",
		kinds: ["text"],
		freeTier: false,
		envVar: "MOONSHOT_API_KEY",
		notes: "Text-only flagship — strong instruction following, long context.",
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
 * Per-surface model choice (why the defaults look the way they do):
 *
 * - detectProtectedElements (vision → bounding boxes): Gemini. Its native
 *   `box_2d` grounding returns tighter boxes than GPT-class models, which have
 *   no native grounding — so the cheaper free model wins here on capability,
 *   not just cost. Escalate to `gemini-3.1-pro-preview` only if real photos
 *   show loose boxes or malformed JSON.
 * - suggestTasks / listRoomContents (vision) and extractFurnitureDimensions
 *   (text): the same Gemini default — none of these benefit enough from a
 *   frontier model to justify metered spend.
 * - generateRenovationImages (image): `gpt-image-2` only; no other wired model
 *   matches its interior-render quality.
 *
 * GPT-5.x stays in the catalogue as a manual option but is the default for
 * nothing — it loses to Gemini on grounding and is overkill elsewhere.
 *
 * The text default points at a free model so unattended cron jobs / tests
 * don't burn paid credits unexpectedly.
 */
export const DEFAULT_TEXT_MODEL: ModelSelection = {
	provider: "google",
	model: "gemini-3.5-flash",
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
