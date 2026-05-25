import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import OpenAI from "openai";
import { z } from "zod";
import { requireEnv } from "../env";
import { buildDesignPrompt, sanitizePromptField } from "./prompts";
import type {
	GeneratedImageResult,
	ProviderDebug,
	ProviderResult,
	RenovationAiProvider,
} from "./types";

/**
 * Models picked per plan. Kept as constants so swaps land in one place and
 * tests can assert against the same identifiers without hardcoding strings.
 */
const TEXT_MODEL = "gpt-5-mini";
const IMAGE_MODEL = "gpt-image-1.5";

/**
 * Zod schemas mirror the BoundingBox + SuggestedTask types. We feed these
 * directly to `generateObject` so the AI SDK enforces the structure (including
 * the bounded `kind` enum) at the model boundary — that replaces the manual
 * `assert*` helpers and the JSON-fence stripping that used to live here.
 */
const boundingBoxSchema = z.object({
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
	width: z.number().min(0).max(1),
	height: z.number().min(0).max(1),
	confidence: z.number().min(0).max(1).optional(),
});

const suggestedTaskSchema = z.object({
	title: z.string().min(1).max(200),
	category: z.string().min(1).max(80),
	rationale: z.string().min(1).max(800),
});

const detectionResponseSchema = z.object({
	elements: z.array(boundingBoxSchema),
});

const tasksResponseSchema = z.object({
	tasks: z.array(suggestedTaskSchema),
});

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

function buildDebug(args: {
	prompt: string;
	object: unknown;
	durationMs: number;
}): ProviderDebug {
	return {
		model: TEXT_MODEL,
		prompt: args.prompt,
		rawResponse: JSON.stringify(args.object, null, 2),
		durationMs: args.durationMs,
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
		const promptText = [
			"Suggest concrete renovation tasks for the described project.",
			"Look at each attached photo and propose tasks grounded in what you see.",
			"Return an object { tasks: [{ title, category, rationale }, ...] }.",
			`Project notes: ${sanitizePromptField(input.projectNotes)}`,
			`Photo count: ${input.photos.length}`,
			...(photoLines.length > 0 ? ["Photos:", ...photoLines] : []),
		].join("\n");

		// Build a single user message that carries the text prompt plus every
		// attached photo as an `image` content part. `gpt-5-mini` is multimodal
		// — passing a URL inside text caused refusals because the model has no
		// fetch capability. Attaching the image as a content part is the
		// correct multimodal contract.
		const userContent: Array<
			{ type: "text"; text: string } | { type: "image"; image: URL }
		> = [{ type: "text", text: promptText }];
		for (const photo of input.photos) {
			if (photo.signedUrl) {
				userContent.push({ type: "image", image: new URL(photo.signedUrl) });
			}
		}

		const startedAt = Date.now();
		const result = await generateObject({
			model: openai(TEXT_MODEL),
			schema: tasksResponseSchema,
			messages: [{ role: "user", content: userContent }],
		});
		const durationMs = Date.now() - startedAt;

		return {
			value: result.object.tasks,
			debug: buildDebug({
				prompt: promptText,
				object: result.object,
				durationMs,
			}),
		};
	},

	async detectProtectedElements(input) {
		const promptText = [
			"Identify protected visual elements in the attached photo that must be preserved exactly during renovation.",
			"Return an object { elements: [{ label, kind, x, y, width, height, confidence }, ...] }.",
			"Coordinates are normalized to the 0..1 range relative to the photo (x,y is the top-left corner; width/height are fractions of the photo).",
			"Allowed kind values (pick the closest match): window, door, stairs, ceiling_line, wall_edge, structure, other. Use 'other' only when nothing else fits.",
			`Task: ${sanitizePromptField(input.taskTitle)}`,
			`Notes: ${sanitizePromptField(input.notes ?? "")}`,
		].join("\n");

		const startedAt = Date.now();
		const result = await generateObject({
			model: openai(TEXT_MODEL),
			schema: detectionResponseSchema,
			messages: [
				{
					role: "user",
					content: [
						{ type: "text", text: promptText },
						{ type: "image", image: new URL(input.photoUrl) },
					],
				},
			],
		});
		const durationMs = Date.now() - startedAt;

		return {
			value: result.object.elements,
			debug: buildDebug({
				prompt: promptText,
				object: result.object,
				durationMs,
			}),
		};
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
			value: {
				markdown,
				prompt: buildDesignPrompt({
					taskTitle: safeTaskTitle,
					styleRules: safeStyleRules,
					briefMarkdown: markdown,
					protectedElements: input.protectedElements,
				}),
			},
		};
	},

	async generateRenovationImages(input) {
		const client = getOpenAiClient();
		const startedAt = Date.now();
		const response = await client.images.generate({
			model: IMAGE_MODEL,
			prompt: input.prompt,
			n: input.count,
			size: "auto",
			quality: "high",
		});
		const durationMs = Date.now() - startedAt;
		const data = response.data ?? [];
		const images = data.map<GeneratedImageResult>((image) => ({
			base64: image.b64_json ?? "",
			contentType: "image/png" as const,
		}));
		const result: ProviderResult<GeneratedImageResult[]> = {
			value: images,
			debug: {
				model: IMAGE_MODEL,
				prompt: input.prompt,
				rawResponse: JSON.stringify(
					{ images: images.map((_, i) => ({ index: i })) },
					null,
					2,
				),
				durationMs,
			},
		};
		return result;
	},
};
