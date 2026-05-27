export type ModelProvider =
	| "openai"
	| "google"
	| "anthropic"
	| "zai"
	| "moonshot"
	| "mock";

export type ModelSelection = {
	provider: ModelProvider;
	model: string;
	label?: string;
};

export type ModelCapability = "entry-prompt" | "detection" | "brief";
export type ModelKind = "text" | "text-vision";

export const DEFAULT_TEXT_MODEL: ModelSelection = {
	provider: "openai",
	model: "gpt-5.4-mini",
	label: "GPT-5.4 mini",
};

export const DEFAULT_IMAGE_MODEL: ModelSelection = {
	provider: "openai",
	model: "gpt-image-2",
	label: "GPT Image 2",
};

export const TEXT_VISION_MODELS: ModelSelection[] = [
	DEFAULT_TEXT_MODEL,
	{
		provider: "openai",
		model: "gpt-5.5",
		label: "GPT-5.5",
	},
	{
		provider: "google",
		model: "gemini-2.5-flash",
		label: "Gemini 2.5 Flash",
	},
	{
		provider: "anthropic",
		model: "claude-sonnet-4-5",
		label: "Claude Sonnet 4.5",
	},
];

export function modelKey(selection: ModelSelection): string {
	return `${selection.provider}:${selection.model}`;
}

export function modelLabel(selection: ModelSelection): string {
	return selection.label ?? selection.model;
}
