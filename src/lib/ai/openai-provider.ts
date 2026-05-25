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

const ALLOWED_BBOX_KINDS = new Set<BoundingBox["kind"]>([
	"window",
	"door",
	"stairs",
	"ceiling_line",
	"wall_edge",
	"structure",
	"other",
]);

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
 * Internal reset hook re-exported only through `./openai-provider.test-utils`.
 * Production callers must never import this directly — the public re-export
 * lives in the sibling test-utils file so the test back-door stays disciplined.
 */
export function __resetOpenAiClientForTestsInternal(): void {
	cachedClient = undefined;
}

/**
 * Parse JSON returned by an LLM. Models sometimes wrap arrays in markdown
 * code fences; strip a single optional fence before parsing so suggestTasks
 * and detectProtectedElements remain resilient to that formatting. Callers
 * provide a per-element shape guard so we fail loudly on malformed payloads.
 */
function parseJsonArray<T>(
	text: string,
	assertItem: (item: unknown) => T,
): T[] {
	const trimmed = text.trim();
	const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
	const payload = fenced ? fenced[1] : trimmed;
	const parsed = JSON.parse(payload);
	if (!Array.isArray(parsed)) {
		throw new Error("Expected JSON array from model");
	}
	return parsed.map(assertItem);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function assertSuggestedTask(item: unknown): SuggestedTask {
	if (!isRecord(item)) {
		throw new Error("SuggestedTask must be an object");
	}
	if (typeof item.title !== "string") {
		throw new Error("SuggestedTask.title must be a string");
	}
	if (typeof item.category !== "string") {
		throw new Error("SuggestedTask.category must be a string");
	}
	if (typeof item.rationale !== "string") {
		throw new Error("SuggestedTask.rationale must be a string");
	}
	return {
		title: item.title,
		category: item.category,
		rationale: item.rationale,
	};
}

function assertDetectedElement(item: unknown): BoundingBox {
	if (!isRecord(item)) {
		throw new Error("BoundingBox must be an object");
	}
	if (typeof item.label !== "string") {
		throw new Error("BoundingBox.label must be a string");
	}
	if (
		typeof item.kind !== "string" ||
		!ALLOWED_BBOX_KINDS.has(item.kind as BoundingBox["kind"])
	) {
		throw new Error("BoundingBox.kind must be one of the allowed kinds");
	}
	if (typeof item.x !== "number") {
		throw new Error("BoundingBox.x must be a number");
	}
	if (typeof item.y !== "number") {
		throw new Error("BoundingBox.y must be a number");
	}
	if (typeof item.width !== "number") {
		throw new Error("BoundingBox.width must be a number");
	}
	if (typeof item.height !== "number") {
		throw new Error("BoundingBox.height must be a number");
	}
	const confidence =
		typeof item.confidence === "number" ? item.confidence : undefined;
	return {
		label: item.label,
		kind: item.kind as BoundingBox["kind"],
		x: item.x,
		y: item.y,
		width: item.width,
		height: item.height,
		...(confidence !== undefined ? { confidence } : {}),
	};
}

export const openAiRenovationProvider: RenovationAiProvider = {
	async suggestTasks(input) {
		const photoLines = input.photos.map((photo, index) => {
			const header = `Photo ${index + 1} (id: ${sanitizePromptField(photo.id)})`;
			if (photo.notes && photo.notes.length > 0) {
				return `${header}\n  notes: ${sanitizePromptField(photo.notes)}`;
			}
			return header;
		});
		const result = await generateText({
			model: openai(TEXT_MODEL),
			prompt: [
				"Suggest renovation tasks for the described project.",
				"Respond with a JSON array of objects with keys: title, category, rationale.",
				`Project notes: ${sanitizePromptField(input.projectNotes)}`,
				`Photo count: ${input.photos.length}`,
				...(photoLines.length > 0 ? ["Photos:", ...photoLines] : []),
			].join("\n"),
		});
		return parseJsonArray<SuggestedTask>(result.text, assertSuggestedTask);
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
				`Photo URL: ${sanitizePromptField(input.photoUrl)}`,
			].join("\n"),
		});
		return parseJsonArray<BoundingBox>(result.text, assertDetectedElement);
	},

	async createDesignBrief(input) {
		const safeTaskTitle = sanitizePromptField(input.taskTitle);
		const safeStyleRules = sanitizePromptField(input.styleRules);
		const markdown = [
			`# ${safeTaskTitle}`,
			"",
			`Style rules: ${safeStyleRules}`,
			"",
			"Preserved elements:",
			...input.protectedElements.map(
				(element) =>
					`- ${sanitizePromptField(element.label)} (${sanitizePromptField(element.kind)})`,
			),
		].join("\n");
		return {
			markdown,
			prompt: buildDesignPrompt({
				taskTitle: safeTaskTitle,
				styleRules: safeStyleRules,
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
