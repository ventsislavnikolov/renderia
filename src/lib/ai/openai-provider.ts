import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import OpenAI from "openai";
import { requireEnv } from "../env";
import { buildDesignPrompt, sanitizePromptField } from "./prompts";
import type {
	BoundingBox,
	GeneratedImageResult,
	RenovationAiProvider,
	SuggestedTask,
} from "./types";

/**
 * Models picked per plan. Kept as constants so swaps land in one place and
 * tests can assert against the same identifiers without hardcoding strings.
 */
const TEXT_MODEL = "gpt-5-mini";
const IMAGE_MODEL = "gpt-image-1.5";

/**
 * Lazy OpenAI client. Constructed on first use so importing this module never
 * requires `OPENAI_API_KEY` to exist — tests can mock the SDK at module level
 * and the env check only fires when the openai provider is actually invoked.
 */
let cachedClient: OpenAI | undefined;
function getOpenAiClient(): OpenAI {
	if (!cachedClient) {
		cachedClient = new OpenAI({
			apiKey: requireEnv(process.env, "OPENAI_API_KEY"),
		});
	}
	return cachedClient;
}

/**
 * Reset hook for tests. Not exported from a public surface — tests reach in
 * via the named export because mocking `OpenAI` constructor still leaves the
 * module-level cache populated across tests.
 */
export function __resetOpenAiClientForTests(): void {
	cachedClient = undefined;
}

/**
 * Parse JSON returned by an LLM. Models sometimes wrap arrays in markdown
 * code fences; strip a single optional fence before parsing so suggestTasks
 * and detectProtectedElements remain resilient to that formatting.
 */
function parseJsonArray<T>(text: string): T[] {
	const trimmed = text.trim();
	const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
	const payload = fenced ? fenced[1] : trimmed;
	const parsed = JSON.parse(payload);
	if (!Array.isArray(parsed)) {
		throw new Error("Expected JSON array from model");
	}
	return parsed as T[];
}

export const openAiRenovationProvider: RenovationAiProvider = {
	async suggestTasks(input) {
		const result = await generateText({
			model: openai(TEXT_MODEL),
			prompt: [
				"Suggest renovation tasks for the described project.",
				"Respond with a JSON array of objects with keys: title, category, rationale.",
				`Project notes: ${sanitizePromptField(input.projectNotes)}`,
				`Photo count: ${input.photos.length}`,
			].join("\n"),
		});
		return parseJsonArray<SuggestedTask>(result.text);
	},

	async detectProtectedElements(input) {
		const result = await generateText({
			model: openai(TEXT_MODEL),
			prompt: [
				"Identify protected visual elements in the photo that must be preserved exactly during renovation.",
				"Respond with a JSON array of objects with keys: label, kind, x, y, width, height, confidence.",
				"Coordinates are normalized to the 0..1 range relative to the photo.",
				`Task: ${sanitizePromptField(input.taskTitle)}`,
				`Notes: ${sanitizePromptField(input.notes ?? "")}`,
				`Photo URL: ${input.photoUrl}`,
			].join("\n"),
		});
		return parseJsonArray<BoundingBox>(result.text);
	},

	async createDesignBrief(input) {
		const markdown = [
			`# ${input.taskTitle}`,
			"",
			`Style rules: ${input.styleRules}`,
			"",
			"Preserved elements:",
			...input.protectedElements.map(
				(element) => `- ${element.label} (${element.kind})`,
			),
		].join("\n");
		return {
			markdown,
			prompt: buildDesignPrompt({
				taskTitle: input.taskTitle,
				styleRules: input.styleRules,
				briefMarkdown: markdown,
				protectedElements: input.protectedElements,
			}),
		};
	},

	async generateRenovationImages(input) {
		const client = getOpenAiClient();
		const response = await client.images.generate({
			model: IMAGE_MODEL,
			prompt: input.prompt,
			n: input.count,
			size: "auto",
			quality: "high",
		});
		const data = response.data ?? [];
		return data.map<GeneratedImageResult>((image) => ({
			base64: image.b64_json ?? "",
			contentType: "image/png" as const,
		}));
	},
};
