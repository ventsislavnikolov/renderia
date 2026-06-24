import { anthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import OpenAI, { toFile } from "openai";
import sharp from "sharp";
import { z } from "zod";
import { requireEnv } from "../env";
import {
	DEFAULT_IMAGE_MODEL,
	DEFAULT_TEXT_MODEL,
	type ModelSelection,
} from "./models";
import {
	buildDesignBriefMarkdown,
	buildDesignPrompt,
	buildOrderRoomAnglesPrompt,
	buildRoomCompositeAnchorPrompt,
	buildRoomCompositeExtendPrompt,
	sanitizePromptField,
} from "./prompts";
import { findStylePreset } from "./style-presets";
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

const roomContentsResponseSchema = z.object({
	items: z.array(z.string().min(1).max(80)).max(30),
});

const tasksResponseSchema = z.object({
	tasks: z.array(suggestedTaskSchema),
});

// OpenAI strict structured-output mode requires every property in `required`,
// so a "not stated" dimension is expressed as nullable rather than optional.
const furnitureDimensionsResponseSchema = z.object({
	widthCm: z.number().positive().nullable(),
	heightCm: z.number().positive().nullable(),
	depthCm: z.number().positive().nullable(),
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

/**
 * Room Composite tiling geometry. `gpt-image-2` caps output at 1536×1024, so a
 * genuinely wide panorama is built by stitching 3:2 tiles: the anchor tile is
 * 1536 wide, then each extension contributes a fresh `TILE_EXT_W`-wide section
 * to the right. `TILE_SEAM_W` is the slice of the running panorama shown to the
 * model (and pixel-locked via the mask) so each extension continues seamlessly.
 */
const TILE_W = 1536;
const TILE_H = 1024;
const TILE_SEAM_W = 512;
const TILE_EXT_W = TILE_W - TILE_SEAM_W; // 1024

type CompositePreview = {
	base64: string;
	contentType: "image/png" | "image/jpeg" | "image/webp";
	filename: string;
};

const angleOrderResponseSchema = z.object({
	order: z.array(z.number().int()),
});

/**
 * Coerce a model-returned order into a clean permutation of 0..n-1: drop
 * duplicates and out-of-range indices, then append any indices the model
 * omitted (in their natural order) so every angle is included exactly once.
 */
function sanitizeAngleOrder(order: number[], n: number): number[] {
	const seen = new Set<number>();
	const out: number[] = [];
	for (const value of order) {
		if (
			Number.isInteger(value) &&
			value >= 0 &&
			value < n &&
			!seen.has(value)
		) {
			seen.add(value);
			out.push(value);
		}
	}
	for (let i = 0; i < n; i++) {
		if (!seen.has(i)) out.push(i);
	}
	return out;
}

/**
 * Ask the default text-vision model to order the angle previews left→right
 * around the room. Best-effort: any failure (or a single angle) falls back to
 * the input order, so a flaky vision call never blocks the composite build.
 */
async function orderRoomAngles(
	previews: CompositePreview[]
): Promise<number[]> {
	const identity = previews.map((_, index) => index);
	if (previews.length <= 1) return identity;
	try {
		const promptText = buildOrderRoomAnglesPrompt(previews.length);
		const content = [
			{ type: "text" as const, text: promptText },
			...previews.flatMap((preview, index) => [
				{ type: "text" as const, text: `Image index ${index}:` },
				{
					type: "image" as const,
					image: Buffer.from(preview.base64, "base64"),
				},
			]),
		];
		const result = await generateObject({
			model: resolveTextModel(DEFAULT_TEXT_MODEL),
			schema: angleOrderResponseSchema,
			messages: [{ role: "user", content }],
		});
		return sanitizeAngleOrder(result.object.order, previews.length);
	} catch {
		return identity;
	}
}

async function editToBuffer(
	client: OpenAI,
	params: {
		image: Awaited<ReturnType<typeof toFile>>;
		mask?: Awaited<ReturnType<typeof toFile>>;
		prompt: string;
		step: string;
	}
): Promise<Buffer> {
	const response = await client.images.edit({
		model: IMAGE_MODEL,
		image: params.image,
		...(params.mask ? { mask: params.mask } : {}),
		prompt: params.prompt,
		n: 1,
		size: "1536x1024",
		quality: "high",
	});
	const b64 = response.data?.[0]?.b64_json;
	if (!b64) {
		throw new Error(`Room composite ${params.step} returned no image`);
	}
	return Buffer.from(b64, "base64");
}

/**
 * Render the leftmost angle as one clean 1536×1024 empty-room tile that every
 * later extension grows rightward from.
 */
async function renderAnchorTile(
	client: OpenAI,
	preview: CompositePreview,
	baseObjective: string
): Promise<Buffer> {
	const base = await sharp(Buffer.from(preview.base64, "base64"))
		.resize(TILE_W, TILE_H, { fit: "cover" })
		.png()
		.toBuffer();
	const tile = await editToBuffer(client, {
		image: await toFile(base, "anchor.png", { type: "image/png" }),
		prompt: buildRoomCompositeAnchorPrompt(baseObjective),
		step: "anchor",
	});
	return sharp(tile).resize(TILE_W, TILE_H, { fit: "fill" }).png().toBuffer();
}

/**
 * Extend the panorama by one angle. Builds a 1536×1024 edit canvas with the
 * panorama's right seam on the left (kept) and the next angle on the right
 * (regenerated under the mask), then appends only the freshly-rendered right
 * section to the running panorama.
 */
async function extendPanorama(
	client: OpenAI,
	panorama: Buffer,
	preview: CompositePreview,
	baseObjective: string
): Promise<Buffer> {
	const panoMeta = await sharp(panorama).metadata();
	const panoW = panoMeta.width ?? TILE_W;

	// Right seam of the current panorama — visual + pixel-locked continuity.
	const seam = await sharp(panorama)
		.extract({
			left: Math.max(0, panoW - TILE_SEAM_W),
			top: 0,
			width: Math.min(TILE_SEAM_W, panoW),
			height: TILE_H,
		})
		.resize(TILE_SEAM_W, TILE_H, { fit: "fill" })
		.png()
		.toBuffer();

	// Next angle, scaled into the regeneration region as strong guidance.
	const angle = await sharp(Buffer.from(preview.base64, "base64"))
		.resize(TILE_EXT_W, TILE_H, { fit: "cover" })
		.png()
		.toBuffer();

	const canvas = await sharp({
		create: {
			width: TILE_W,
			height: TILE_H,
			channels: 4,
			background: { r: 255, g: 255, b: 255, alpha: 1 },
		},
	})
		.composite([
			{ input: seam, left: 0, top: 0 },
			{ input: angle, left: TILE_SEAM_W, top: 0 },
		])
		.png()
		.toBuffer();

	// Mask: opaque (keep) over the seam, transparent (regenerate) on the right.
	const keepRegion = await sharp({
		create: {
			width: TILE_SEAM_W,
			height: TILE_H,
			channels: 4,
			background: { r: 255, g: 255, b: 255, alpha: 1 },
		},
	})
		.png()
		.toBuffer();
	const mask = await sharp({
		create: {
			width: TILE_W,
			height: TILE_H,
			channels: 4,
			background: { r: 0, g: 0, b: 0, alpha: 0 },
		},
	})
		.composite([{ input: keepRegion, left: 0, top: 0 }])
		.png()
		.toBuffer();

	const tile = await editToBuffer(client, {
		image: await toFile(canvas, "canvas.png", { type: "image/png" }),
		mask: await toFile(mask, "mask.png", { type: "image/png" }),
		prompt: buildRoomCompositeExtendPrompt(baseObjective),
		step: "extension",
	});

	// Keep only the newly-generated right section and append it.
	const newRegion = await sharp(tile)
		.resize(TILE_W, TILE_H, { fit: "fill" })
		.extract({ left: TILE_SEAM_W, top: 0, width: TILE_EXT_W, height: TILE_H })
		.png()
		.toBuffer();
	return sharp({
		create: {
			width: panoW + TILE_EXT_W,
			height: TILE_H,
			channels: 4,
			background: { r: 255, g: 255, b: 255, alpha: 1 },
		},
	})
		.composite([
			{ input: panorama, left: 0, top: 0 },
			{ input: newRegion, left: panoW, top: 0 },
		])
		.png()
		.toBuffer();
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
		const stylePreset = findStylePreset(input.style);
		const markdown = buildDesignBriefMarkdown({
			taskTitle: safeTaskTitle,
			styleRules: safeStyleRules,
			protectedElements: input.protectedElements,
			roomObjects: input.roomObjects,
			stylePreset,
		});
		return {
			value: {
				markdown,
				prompt: buildDesignPrompt({
					taskTitle: safeTaskTitle,
					styleRules: safeStyleRules,
					briefMarkdown: markdown,
					protectedElements: input.protectedElements,
					roomObjects: input.roomObjects,
					referencePhotoName: input.referencePhotoName,
					supportingPhotoCount: input.supportingPhotoCount,
					stylePreset,
				}),
			},
		};
	},

	async listRoomContents(input) {
		const selection = input.model ?? DEFAULT_TEXT_MODEL;
		const promptText = [
			"List every piece of furniture and notable decor visible in this interior render.",
			"Rules:",
			"- One entry per distinct item; merge duplicates into one entry with a count (e.g. 'two framed prints').",
			"- Short lowercase noun phrases with the key material/color (e.g. 'white 4-drawer dresser', 'light oak coffee table').",
			"- Include rugs, curtains, lamps, plants, and wall art; skip walls, floors, ceilings, windows, doors, and radiators.",
			"- Order by visual prominence, most prominent first.",
			'Return an object { items: ["...", ...] }.',
		].join("\n");

		const startedAt = Date.now();
		const result = await generateObject({
			model: resolveTextModel(selection),
			schema: roomContentsResponseSchema,
			messages: [
				{
					role: "user",
					content: [
						{ type: "text", text: promptText },
						{ type: "image", image: new URL(input.imageUrl) },
					],
				},
			],
		});
		const durationMs = Date.now() - startedAt;

		return {
			value: result.object.items,
			debug: buildDebug({
				modelId: selection.model,
				prompt: promptText,
				object: result.object,
				durationMs,
			}),
		};
	},

	async extractFurnitureDimensions(input) {
		const selection = input.model ?? DEFAULT_TEXT_MODEL;
		const promptText = [
			"Extract the physical dimensions of the product described in the page text below.",
			"Return centimetres as numbers for width, height, and depth.",
			"Rules:",
			"- Convert other units to centimetres (1 m = 100 cm, 1 mm = 0.1 cm, 1 in = 2.54 cm).",
			"- width = horizontal span, height = floor-to-top, depth = front-to-back.",
			"- Use null for any dimension the text does not state. Never guess.",
			"Return an object { widthCm, heightCm, depthCm }.",
			input.productName
				? `Product: ${sanitizePromptField(input.productName)}`
				: "",
			"Page text:",
			sanitizePromptField(input.pageText, 12_000),
		]
			.filter((line) => line !== "")
			.join("\n");

		const startedAt = Date.now();
		const result = await generateObject({
			model: resolveTextModel(selection),
			schema: furnitureDimensionsResponseSchema,
			messages: [
				{ role: "user", content: [{ type: "text", text: promptText }] },
			],
		});
		const durationMs = Date.now() - startedAt;

		return {
			value: {
				widthCm: result.object.widthCm,
				heightCm: result.object.heightCm,
				depthCm: result.object.depthCm,
			},
			debug: buildDebug({
				modelId: selection.model,
				prompt: promptText,
				object: result.object,
				durationMs,
			}),
		};
	},

	async generateRenovationImages(input) {
		const client = getOpenAiClient();
		const startedAt = Date.now();
		// One provider call per variation so each image gets its own concept
		// prompt while sharing the same source photo. `n: 1` per call keeps
		// the request shape simple and avoids the n>1-per-prompt limit on
		// image-edit mode. Fired in parallel — gpt-image-2 handles concurrent
		// requests fine and the user-perceived latency drops from N×T to ~T.
		const sourceImage = input.sourceImage;
		const sourceFile = sourceImage
			? await toFile(
					Buffer.from(sourceImage.base64, "base64"),
					sourceImage.filename,
					{ type: sourceImage.contentType }
				)
			: null;
		// Furniture references become additional input images on the same edit
		// call — gpt-image edit mode accepts an image array, with the first
		// image treated as the primary subject. Only meaningful with a source
		// photo; text-to-image mode has no slot for them.
		const referenceFiles = sourceFile
			? await Promise.all(
					(input.referenceImages ?? []).map((reference) =>
						toFile(
							Buffer.from(reference.base64, "base64"),
							reference.filename,
							{
								type: reference.contentType,
							}
						)
					)
				)
			: [];
		const editImage =
			sourceFile && referenceFiles.length > 0
				? [sourceFile, ...referenceFiles]
				: sourceFile;
		const outputSize = input.outputSize ?? "auto";
		const responses = await Promise.all(
			input.prompts.map((prompt) =>
				editImage
					? client.images.edit({
							model: IMAGE_MODEL,
							image: editImage,
							prompt,
							n: 1,
							size: outputSize,
							quality: "high",
						})
					: client.images.generate({
							model: IMAGE_MODEL,
							prompt,
							n: 1,
							size: outputSize,
							quality: "high",
						})
			)
		);
		const durationMs = Date.now() - startedAt;
		const images = responses.flatMap<GeneratedImageResult>((response) =>
			(response.data ?? []).map((image) => ({
				base64: image.b64_json ?? "",
				contentType: "image/png" as const,
			}))
		);
		const result: ProviderResult<GeneratedImageResult[]> = {
			value: images,
			debug: {
				model: IMAGE_MODEL,
				prompt: input.prompts.join("\n\n---\n\n"),
				rawResponse: JSON.stringify(
					{
						mode: sourceImage ? "edit" : "generate",
						variations: input.prompts.length,
						referenceImages: referenceFiles.length,
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
	async generateRoomComposite(input) {
		const client = getOpenAiClient();
		const startedAt = Date.now();
		if (input.previews.length === 0) {
			throw new Error("Room composite needs at least one approved preview");
		}

		// `gpt-image-2` caps a single edit at 1536×1024, which can only hold one
		// corner of a multi-angle room. To deliver a genuinely wide whole-room
		// view we order the angles left→right, render an anchor tile, then
		// progressively outpaint the canvas one angle at a time and stitch the
		// fresh sections into one wide panorama. See docs/adr/0002.
		const order = await orderRoomAngles(input.previews);
		const ordered = order.map((index) => input.previews[index]);

		let panorama = await renderAnchorTile(client, ordered[0], input.prompt);
		for (let i = 1; i < ordered.length; i++) {
			panorama = await extendPanorama(
				client,
				panorama,
				ordered[i],
				input.prompt
			);
		}

		const finalPng = await sharp(panorama).png().toBuffer();
		const meta = await sharp(finalPng).metadata();
		const durationMs = Date.now() - startedAt;
		return {
			value: {
				base64: finalPng.toString("base64"),
				contentType: "image/png" as const,
			},
			debug: {
				model: IMAGE_MODEL,
				prompt: input.prompt,
				rawResponse: JSON.stringify(
					{
						mode: "progressive-outpaint",
						angles: ordered.length,
						order,
						width: meta.width ?? null,
						height: meta.height ?? null,
					},
					null,
					2
				),
				durationMs,
			},
		};
	},
};
