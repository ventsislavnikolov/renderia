import { anthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import OpenAI, { toFile } from "openai";
import { z } from "zod";
import { requireEnv } from "../env";
import {
	DEFAULT_IMAGE_MODEL,
	DEFAULT_TEXT_MODEL,
	type ModelSelection,
} from "./models";
import { buildDesignPrompt, sanitizePromptField } from "./prompts";
import type {
	GeneratedImageResult,
	ProviderDebug,
	ProviderResult,
	RenovationAiProvider,
} from "./types";

/**
 * Image generation is OpenAI-only today — Gemini and Anthropic don't ship a
 * photo-realistic interior renderer comparable to gpt-image-2. Exported so
 * the server fn can reference the model id without re-deriving it.
 */
export const OPENAI_IMAGE_MODEL = DEFAULT_IMAGE_MODEL.model;
const IMAGE_MODEL = OPENAI_IMAGE_MODEL;

/**
 * Lazy Google client. `@ai-sdk/google` reads `GOOGLE_GENERATIVE_AI_API_KEY`
 * by default but we want the simpler `GEMINI_API_KEY` name on the env (it
 * matches what Google AI Studio shows when you create the key). Cached so
 * we don't re-instantiate the wrapper per call.
 */
let cachedGoogle: ReturnType<typeof createGoogleGenerativeAI> | undefined;
function getGoogleClient() {
	if (!cachedGoogle) {
		cachedGoogle = createGoogleGenerativeAI({
			apiKey: requireEnv(process.env, "GEMINI_API_KEY"),
		});
	}
	return cachedGoogle;
}

/**
 * Lazy Z.AI (Zhipu) client. Z.AI exposes an OpenAI-compatible API at
 * `https://api.z.ai/api/paas/v4/`, so we just point `@ai-sdk/openai` at it
 * with a custom base URL + the Z.AI key. `generateObject` works for GLM-4.5
 * via Z.AI's structured-output mode; if a future model rejects schema mode,
 * fall back to `generateText` + manual JSON parse for that model only.
 */
const ZAI_BASE_URL = "https://api.z.ai/api/paas/v4/";
let cachedZai: ReturnType<typeof createOpenAI> | undefined;
function getZaiClient() {
	if (!cachedZai) {
		cachedZai = createOpenAI({
			baseURL: ZAI_BASE_URL,
			apiKey: requireEnv(process.env, "ZAI_API_KEY"),
		});
	}
	return cachedZai;
}

/**
 * Lazy Moonshot client. Moonshot exposes an OpenAI-compatible API at
 * `https://api.moonshot.ai/v1/` (international) — same multi-modal content
 * shape as OpenAI, so we just point `createOpenAI` at it.
 */
const MOONSHOT_BASE_URL = "https://api.moonshot.ai/v1/";
let cachedMoonshot: ReturnType<typeof createOpenAI> | undefined;
function getMoonshotClient() {
	if (!cachedMoonshot) {
		cachedMoonshot = createOpenAI({
			baseURL: MOONSHOT_BASE_URL,
			apiKey: requireEnv(process.env, "MOONSHOT_API_KEY"),
		});
	}
	return cachedMoonshot;
}

/**
 * Resolve a `{ provider, model }` selection to a Vercel AI SDK model. All
 * three providers expose the same `generateObject` + multimodal-messages
 * surface so the call site stays provider-agnostic — only the SDK factory
 * differs. Throws on `mock` because the mock provider has its own code path
 * and should never reach the SDK dispatcher.
 */
function resolveTextModel(selection: ModelSelection) {
	switch (selection.provider) {
		case "openai":
			return openai(selection.model);
		case "google":
			return getGoogleClient()(selection.model);
		case "anthropic":
			return anthropic(selection.model);
		case "zai":
			return getZaiClient()(selection.model);
		case "moonshot":
			return getMoonshotClient()(selection.model);
		case "mock":
			throw new Error(
				"resolveTextModel called with provider=mock — wire mockRenovationProvider before dispatch."
			);
		default: {
			const exhaustive: never = selection.provider;
			throw new Error(`Unknown provider: ${exhaustive as string}`);
		}
	}
}

/**
 * Zod schemas mirror the BoundingBox + SuggestedTask types. We feed these
 * directly to `generateObject` so the AI SDK enforces the structure (including
 * the bounded `kind` enum) at the model boundary — that replaces the manual
 * `assert*` helpers and the JSON-fence stripping that used to live here.
 */
const boundingBoxSchema = z.object({
	label: z.string().min(1).max(60),
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
	// OpenAI's strict structured-output mode requires every property to be in
	// `required`; optional fields must use nullable instead. We translate null
	// back to undefined when returning to match the BoundingBox type.
	confidence: z.number().min(0).max(1).nullable(),
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
 * Lazy OpenAI client (used for image generation only — text calls go through
 * the AI SDK and don't need this). Constructed on first use so importing this
 * module never requires `OPENAI_API_KEY` to exist — tests can mock the SDK at
 * module level and the env check only fires when image gen is invoked.
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
	modelId: string;
	prompt: string;
	object: unknown;
	durationMs: number;
}): ProviderDebug {
	return {
		model: args.modelId,
		prompt: args.prompt,
		rawResponse: JSON.stringify(args.object, null, 2),
		durationMs: args.durationMs,
	};
}

export const openAiRenovationProvider: RenovationAiProvider = {
	async suggestTasks(input) {
		const selection = input.model ?? DEFAULT_TEXT_MODEL;
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
			model: resolveTextModel(selection),
			schema: tasksResponseSchema,
			messages: [{ role: "user", content: userContent }],
		});
		const durationMs = Date.now() - startedAt;

		return {
			value: result.object.tasks,
			debug: buildDebug({
				modelId: selection.model,
				prompt: promptText,
				object: result.object,
				durationMs,
			}),
		};
	},

	async detectProtectedElements(input) {
		const selection = input.model ?? DEFAULT_TEXT_MODEL;
		const promptText = [
			"You are helping plan a renovation. The user wants to preserve a small number of specific, distinctive architectural details exactly as they are; everything else can be changed.",
			"",
			"Identify 0-5 SPECIFIC protected elements: a single window frame, a single doorway, a distinctive beam, a fireplace, a staircase, a moulding, etc. Each element must be a DISCRETE feature, never a broad region.",
			"",
			"Bounding box precision (this is critical):",
			"- Coordinates are normalized 0..1 (x,y = top-left of box; width,height = fractions of photo dimensions).",
			"- Each box edge MUST touch the actual visible edge of the feature within ~3% of the photo's dimension. Snap to door frames, window frames, beam outlines, etc.",
			"- A box must contain less than 20% empty/background area. Pick the tightest axis-aligned rectangle around the feature's visible bounds.",
			"- No box may exceed 40% of the photo area. If a feature is larger, tighten to a sub-feature (the frame, not the whole wall) or skip it.",
			"- Boxes may not overlap by more than 10%.",
			"",
			"Examples of GOOD boxes:",
			"- A door: box snaps to the four outer edges of the door frame. ~15-25% of photo.",
			"- A window: box snaps to the outer trim of the window frame. ~3-15% of photo.",
			"- An exposed beam: tight rectangle along the beam's visible run.",
			"",
			"Examples of BAD boxes (do NOT do these):",
			"- A door box that extends 10% past the frame into surrounding wall.",
			"- A 'ceiling' box covering the entire upper third of the photo.",
			"- A box that includes floor, wall, AND the feature.",
			"- Overlapping 'roof beam' and 'ceiling' boxes covering the same area.",
			"",
			"What to skip:",
			"- Plain walls, plain ceilings, plain floors, generic clutter, debris, dirt, cobwebs.",
			"- Heavily damaged or obscured surfaces where edges can't be identified clearly.",
			"- Features so generic they have no renovation-preserving value (e.g. a blank brick wall).",
			"- If unsure of an edge, prefer omitting the element over guessing.",
			"- An empty array is the correct answer for chaotic, generic, or fully-renovation-ready interiors.",
			"",
			"Output rules:",
			"- Label: under 60 characters, plain descriptive noun phrase. NO parenthetical explanations.",
			"- Allowed kind values (pick the closest match): window, door, stairs, ceiling_line, wall_edge, structure, other. Use 'other' sparingly.",
			"- Confidence: 0..1, how sure you are about BOTH the box's tightness AND that the feature is worth preserving.",
			"- Order results by confidence descending.",
			"",
			`Task context: ${sanitizePromptField(input.taskTitle)}`,
			input.notes ? `Notes: ${sanitizePromptField(input.notes)}` : "",
		]
			.filter((line) => line !== "")
			.join("\n");

		const startedAt = Date.now();
		const result = await generateObject({
			model: resolveTextModel(selection),
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
			value: result.object.elements.map((element) => {
				const { confidence, ...rest } = element;
				return confidence == null ? rest : { ...rest, confidence };
			}),
			debug: buildDebug({
				modelId: selection.model,
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
					`- ${sanitizePromptField(element.label)} (${sanitizePromptField(element.kind)})`
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
		// Image-edit mode preserves the source room's geometry, lighting, and
		// the positions of doors/windows/beams. `input_fidelity: "high"` tells
		// gpt-image-2 to stick close to the input image rather than treating
		// it as loose inspiration. Without a source image we fall back to
		// text-to-image — the mock provider hits this branch in tests.
		const response = input.sourceImage
			? await client.images.edit({
					model: IMAGE_MODEL,
					image: await toFile(
						Buffer.from(input.sourceImage.base64, "base64"),
						input.sourceImage.filename,
						{ type: input.sourceImage.contentType }
					),
					prompt: input.prompt,
					n: input.count,
					size: "auto",
					quality: "high",
					input_fidelity: "high",
				})
			: await client.images.generate({
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
					{
						mode: input.sourceImage ? "edit" : "generate",
						images: images.map((_, i) => ({ index: i })),
					},
					null,
					2
				),
				durationMs,
			},
		};
		return result;
	},
};
