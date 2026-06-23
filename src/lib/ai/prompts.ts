import type { RoomObject } from "../renovation/room-state";
import { SCANDINAVIAN_PRESET, type StylePreset } from "./style-presets";
import type { BoundingBox } from "./types";

const SECTION_HEADER_PATTERN =
	/^(PRESERVE EXACTLY|Brief|Style rules?|Constraints?|TASK|OUTPUT|VARIATION CONCEPT|STRICT ARCHITECTURAL RULES|DOOR RENOVATION RULE|WINDOW TREATMENT RULE|FLOORING|WALL|DESIGN STYLE|FURNITURE REQUIREMENTS|NEGATIVE INSTRUCTIONS|VISUAL STYLE|SOURCE PHOTO FIDELITY|ALLOWED CHANGES|STYLE AND MATERIAL DIRECTION|DESIGN BRIEF|OUTPUT REQUIREMENTS)\b/i;
const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0B-\x1F\x7F]/g;

export function sanitizePromptField(value: string, maxLength = 2000): string {
	const stripped = value.replace(CONTROL_CHAR_PATTERN, "");
	const neutralized = stripped
		.split("\n")
		.map((line) => (SECTION_HEADER_PATTERN.test(line) ? `> ${line}` : line))
		.join("\n");
	if (neutralized.length > maxLength) {
		return `${neutralized.slice(0, maxLength)}…`;
	}
	return neutralized;
}

/**
 * Coarse, image-model-friendly position phrase for a box. In edit mode
 * `gpt-image-2` already sees the photo, so it anchors on a natural description
 * ("the tall window on the left wall") far better than on numeric coordinates.
 * Buckets the box centre into a 3×3 grid; the exact percentages stay on the UI
 * overlay and the `protected_elements` rows, never in the prompt.
 */
function coarsePosition(element: BoundingBox): string {
	const centerX = element.x + element.width / 2;
	const centerY = element.y + element.height / 2;
	const horizontal = centerX < 1 / 3 ? "left" : centerX >= 2 / 3 ? "right" : "";
	const vertical = centerY < 1 / 3 ? "top" : centerY >= 2 / 3 ? "bottom" : "";
	const parts = [vertical, horizontal].filter(Boolean);
	return parts.length > 0 ? parts.join("-") : "center";
}

function protectedElementLine(element: BoundingBox): string {
	return `${sanitizePromptField(element.label)} (${sanitizePromptField(element.kind)}) — in the ${coarsePosition(element)} of the source photo; keep it exactly where and as it is`;
}

function roomObjectLine(object: RoomObject): string {
	const modeLine =
		object.preservationMode === "keep_type_restyle"
			? "same opening and footprint, but may be redesigned in a neutral updated style"
			: "keep the same identity, placement, and visible form";
	return `- ${sanitizePromptField(object.label)} (${sanitizePromptField(object.kind)}) mode=${object.preservationMode}; ${modeLine}. Evidence views: ${object.appearanceIds.length}.`;
}

/**
 * The two global **Takes** — contrasting design moods that differentiate the
 * variations. A Take is independent of both the room's function (which comes
 * from the task title) and the Style (which comes from the preset):
 * `buildConceptVariationPrompts` layers one Take onto the already style-aware
 * base prompt, so the same Take reads correctly under any Style. Two Takes →
 * two variations (see docs/adr/0004-parameterized-style-presets.md).
 *
 * `curtainTone` (light vs dark) feeds the window-treatment rule, which defers
 * to "this variation's curtain tone".
 */
export const TAKES = [
	{
		id: "airy",
		label: "Airy & minimal",
		curtainTone: "light",
		description:
			"Airy and minimal: fewer, larger pieces with generous negative space, light and bright, calm uncluttered surfaces, and only a few well-chosen accents.",
	},
	{
		id: "layered",
		label: "Warm & layered",
		curtainTone: "dark",
		description:
			"Warm and layered: cozy textiles, rugs and cushions, richer accent tones, and more pieces arranged into inviting, well-defined zones.",
	},
] as const;

/**
 * Markdown brief shown to the user before generation. Surfaces the same
 * playbook the image prompt enforces — door/window/floor/wall/furniture
 * rules — so the user understands what the AI will be asked to honour.
 */
export function buildDesignBriefMarkdown(input: {
	taskTitle: string;
	styleRules: string;
	protectedElements: BoundingBox[];
	roomObjects?: RoomObject[];
	stylePreset?: StylePreset;
}) {
	const preset = input.stylePreset ?? SCANDINAVIAN_PRESET;
	const canonicalObjects = input.roomObjects?.filter(
		(entry) => entry.isPersisted
	);
	const preserved =
		canonicalObjects && canonicalObjects.length > 0
			? canonicalObjects.map(roomObjectLine).join("\n")
			: input.protectedElements.length > 0
				? input.protectedElements
						.map((element) => `- ${protectedElementLine(element)}`)
						.join("\n")
				: "- No protected elements were confirmed. Keep the source photo's visible structural layout stable.";

	const takes = TAKES.map(
		(take, index) =>
			`${index + 1}. **${sanitizePromptField(take.label)}** — ${sanitizePromptField(take.description)} (${take.curtainTone} curtains)`
	).join("\n");

	return [
		`# ${sanitizePromptField(input.taskTitle)}`,
		"",
		"## Goal",
		`Create realistic, fully furnished ${sanitizePromptField(preset.aesthetic)} renovation concepts for ${sanitizePromptField(input.taskTitle)} that look like the same real room after renovation — not a different room.`,
		"",
		"## Must preserve",
		preserved,
		"- Window positions, sizes, and walls (do not move, resize, or invent).",
		"- Door openings (positions, sizes, walls). Door panels may be replaced with Scandinavian-style interior doors.",
		"- Radiator positions.",
		"- Room shape, proportions, ceiling height, corners, niches, beams, columns, stairs, slopes.",
		"- Camera angle and perspective matching the source photo.",
		"",
		`## Renovation rules (${sanitizePromptField(preset.label)})`,
		"**Doors**",
		...preset.doorRule,
		"**Windows**",
		...preset.windowRule,
		"**Flooring**",
		...preset.flooringRule,
		"**Walls / ceiling**",
		...preset.wallCeilingRule,
		"**Furniture**",
		...preset.furnitureRule,
		"",
		"## Style Direction",
		sanitizePromptField(input.styleRules),
		"",
		"## Variations",
		takes,
		"",
		"## Generation guidance",
		"- Use the source photo as the geometry and composition reference.",
		"- Keep the same camera viewpoint, lens feel, room proportions, wall openings, ceiling lines, stair positions, and major edges.",
		"- Do not block windows, doors, or radiators with furniture.",
		`- Keep furniture and finishes consistent with the ${sanitizePromptField(preset.label)} Style; avoid pieces that contradict it.`,
	].join("\n");
}

/**
 * Base image-generation prompt. Holds the architectural rules, source-photo
 * fidelity requirements, the renovation playbook, and the negative
 * instructions. Per-variation Take text is appended later by
 * `buildConceptVariationPrompts` — keeping the base/per-Take split means the
 * variations share the same room, Style, and rules, differing only by Take.
 */
export function buildDesignPrompt(input: {
	taskTitle: string;
	styleRules: string;
	briefMarkdown: string;
	protectedElements: BoundingBox[];
	roomObjects?: RoomObject[];
	referencePhotoId?: string;
	referencePhotoName?: string;
	supportingPhotoCount?: number;
	stylePreset?: StylePreset;
}) {
	const preset = input.stylePreset ?? SCANDINAVIAN_PRESET;
	const preserved = input.protectedElements
		.map((element) => `- ${protectedElementLine(element)}`)
		.join("\n");
	const canonicalObjects = input.roomObjects?.filter(
		(entry) => entry.isPersisted
	);
	const objectSection =
		canonicalObjects && canonicalObjects.length > 0
			? [
					"",
					"APPROVED ROOM OBJECTS:",
					...canonicalObjects.map(roomObjectLine),
					input.referencePhotoName
						? `- Approved render angle: ${sanitizePromptField(input.referencePhotoName)}.`
						: null,
					input.supportingPhotoCount
						? `- Supporting room evidence: ${input.supportingPhotoCount} photo(s).`
						: null,
				]
					.filter(Boolean)
					.join("\n")
			: "";

	return [
		"RENOVATION OBJECTIVE:",
		`Using the source photo as reference, create a realistic ${sanitizePromptField(preset.aesthetic)} renovation render for ${sanitizePromptField(input.taskTitle)}. The output must look like the same real room after renovation, not a different room.`,
		"",
		"SOURCE PHOTO FIDELITY:",
		"- Use the supplied source photo as the geometry, camera, and composition reference.",
		"- Keep the same camera viewpoint, room proportions, wall/floor/ceiling planes, opening positions, and major structural edges.",
		"- Preserve lighting direction and perspective.",
		"",
		"STRICT ARCHITECTURAL RULES:",
		"- Keep all windows in exactly the same position, size, and wall.",
		"- Keep all door openings in exactly the same position, size, and wall.",
		"- Keep all radiators in exactly the same position.",
		"- Keep the real room shape, proportions, ceiling height, corners, niches, beams, columns, stairs, and slopes.",
		"- Do not invent extra windows, door openings, walls, or architectural changes.",
		"- Do not make the room larger or smaller than it really is.",
		"",
		"PRESERVE EXACTLY:",
		preserved || "- No additional protected elements confirmed.",
		"- Do not move, remove, resize, crop, cover, or replace any protected element.",
		...(objectSection ? [objectSection] : []),
		"",
		`STYLE: ${preset.label.toUpperCase()}`,
		"",
		"DOOR RENOVATION RULE:",
		...preset.doorRule,
		"",
		"WINDOW TREATMENT RULE:",
		...preset.windowRule,
		"",
		"FLOORING RULE:",
		...preset.flooringRule,
		"",
		"WALL / CEILING RULE:",
		...preset.wallCeilingRule,
		"",
		"FURNITURE REQUIREMENTS:",
		...preset.furnitureRule,
		"",
		"STYLE DIRECTION (user refinement layer):",
		sanitizePromptField(input.styleRules),
		"",
		"DESIGN BRIEF:",
		sanitizePromptField(input.briefMarkdown),
		"",
		"VISUAL STYLE:",
		preset.visualStyle,
		"",
		"NEGATIVE INSTRUCTIONS:",
		"- Do not change the position of windows, doors, or radiators.",
		"- Do not invent extra openings, walls, or architectural features.",
		"- Do not redesign the room into a different shape or size.",
		"- Do not block windows, doors, or radiators with furniture.",
		...preset.negativeStyle,
		"",
		"OUTPUT REQUIREMENTS:",
		"- Photorealistic renovation concept, not a technical drawing.",
		"- Preserve the source photo's layout first; apply the Scandinavian playbook second.",
	].join("\n");
}

export function buildStructuralPreviewPrompt(input: {
	taskTitle: string;
	referencePhotoName?: string;
	roomObjects: RoomObject[];
	supportingPhotoCount: number;
}) {
	const persisted = input.roomObjects.filter((entry) => entry.isPersisted);
	return [
		"STRUCTURAL PREVIEW OBJECTIVE:",
		`Using the chosen source photo as the camera angle, generate one believable empty room structural preview for ${sanitizePromptField(input.taskTitle)}.`,
		"- This is not the final furnished design.",
		"- Show an empty room + persisted objects only, with minimal neutral architectural finish detail.",
		"- Do not add furniture, decor, staging, or design personality.",
		"- Preserve room geometry, openings, and structural layout from the full room evidence set.",
		input.referencePhotoName
			? `- Reference photo angle: ${sanitizePromptField(input.referencePhotoName)}.`
			: null,
		`- Supporting room evidence: ${input.supportingPhotoCount} photo(s).`,
		"",
		"ROOM OBJECT RULES:",
		...persisted.map(roomObjectLine),
		"",
		"MODE INTERPRETATION:",
		"- exact_preserve means keep the object materially unchanged.",
		"- keep_type_restyle means keep the same type, opening, and footprint, but show a neutral updated style.",
		"",
		"OUTPUT RULES:",
		"- The preview must still look like the same room and the same camera viewpoint.",
		"- Blue-mode objects should already appear in a neutral updated style.",
		"- Red-mode objects should remain visually the same aside from minor generative noise.",
	]
		.filter(Boolean)
		.join("\n");
}

/**
 * Prompt for the Room Composite synthesis. The input images are the approved
 * per-angle Structural Previews; the model must stitch the *captured arc* into
 * one continuous wide (3:2) empty room. It must NOT invent walls that were
 * never photographed and must NOT add furniture — this is still an empty-room
 * confirmation image, just covering the whole captured room instead of one
 * angle. See docs/adr/0002.
 */
export function buildRoomCompositePrompt(input: {
	taskTitle: string;
	roomObjects: RoomObject[];
	sourcePreviewCount: number;
}) {
	const persisted = input.roomObjects.filter((entry) => entry.isPersisted);
	return [
		"ROOM COMPOSITE OBJECTIVE:",
		`Combine the supplied empty-room angle previews into ONE continuous wide empty-room view for ${sanitizePromptField(input.taskTitle)}.`,
		`- Every input image is an empty-room preview of the same room from a different angle (${input.sourcePreviewCount} angle(s)).`,
		"- Produce a single wide (3:2 landscape) image that reads as the whole room as captured, stitching the angles into one coherent space.",
		"- Cover only the walls and areas visible across the previews. Do NOT invent or fabricate walls, openings, or areas that none of the previews show.",
		"- Keep it an EMPTY room: no furniture, decor, staging, or design personality.",
		"- Preserve room geometry, proportions, openings, and the structural layout shown in the previews.",
		"",
		"ROOM OBJECT RULES:",
		...persisted.map(roomObjectLine),
		"",
		"OUTPUT RULES:",
		"- One photorealistic wide empty-room image, consistent lighting across the stitched view.",
		"- Same materials and finishes as the source previews; do not restyle beyond what the previews already show.",
		"- This is not the final furnished design; it is the empty-room basis the furnished concepts are generated against.",
	]
		.filter(Boolean)
		.join("\n");
}

/**
 * One furniture piece referenced by a generation run. Dimensions are
 * optional and independently nullable — manual items may leave any subset
 * blank, and Link Import fills whatever the retailer page exposes.
 */
export type FurnitureReferenceItem = {
	label: string;
	widthCm?: number | null;
	heightCm?: number | null;
	depthCm?: number | null;
};

function formatDimensionValue(value: number): string {
	// numeric(8,1) columns arrive as 72 or 72.5 — strip the trailing ".0".
	return String(Number(value));
}

/**
 * Compact dimension string for the prompt. Full W×H×D sets render in the
 * unlabeled retailer form ("72×76×77 cm"); partial sets keep W/H/D prefixes
 * so the remaining axis stays unambiguous. Returns null when no dimension is
 * known, in which case the item is described by label alone.
 */
function formatFurnitureDimensions(
	item: FurnitureReferenceItem
): string | null {
	const { widthCm, heightCm, depthCm } = item;
	if (widthCm != null && heightCm != null && depthCm != null) {
		return `${formatDimensionValue(widthCm)}×${formatDimensionValue(heightCm)}×${formatDimensionValue(depthCm)} cm`;
	}
	const parts: string[] = [];
	if (widthCm != null) parts.push(`W${formatDimensionValue(widthCm)}`);
	if (heightCm != null) parts.push(`H${formatDimensionValue(heightCm)}`);
	if (depthCm != null) parts.push(`D${formatDimensionValue(depthCm)}`);
	if (parts.length === 0) return null;
	return `${parts.join("×")} cm`;
}

/**
 * Prompt section describing furniture reference images that accompany the
 * source photo in image-edit mode. The first input image is always the room;
 * every following image is one furniture piece the design must include.
 * Appended to each variation prompt by the generation server fn so adding
 * furniture never requires regenerating the design brief. Items that carry
 * dimensions render them after the label ("UDSBJERG armchair, 72×76×77 cm")
 * so renders respect proportions relative to the room.
 */
export function buildFurnitureReferenceSection(
	items: FurnitureReferenceItem[]
): string {
	if (items.length === 0) return "";
	return [
		"FURNITURE TO INCLUDE (mandatory):",
		"- Input images after the first are furniture references, NOT room geometry. Only the first image defines the room.",
		...items.map((item, index) => {
			const dimensions = formatFurnitureDimensions(item);
			const described = dimensions
				? `${sanitizePromptField(item.label)}, ${dimensions}`
				: sanitizePromptField(item.label);
			return `- Reference image ${index + 2}: ${described}. This exact piece must appear in the room, prominently and recognizably, matching its real shape, color, and material.`;
		}),
		"- Place each referenced piece naturally within the room layout. Do not duplicate a referenced piece multiple times.",
		"- Do not copy backgrounds, walls, floors, or other objects from the reference images.",
	].join("\n");
}

/**
 * Expand the style-aware base prompt into N per-variation prompts by layering
 * one `TAKES` entry onto each. The base prompt already carries the Style; this
 * appends the Take's mood + curtain tone, so the result is preset × take. The
 * provider is called once per returned prompt.
 *
 * `count` is capped at the number of Takes — there are only two distinct moods,
 * so asking for more yields at most two variations rather than repeating a Take.
 */
export function buildConceptVariationPrompts(
	basePrompt: string,
	count: number
): string[] {
	const safeCount = Math.max(1, Math.min(count, TAKES.length));
	const prompts: string[] = [];
	for (let index = 0; index < safeCount; index += 1) {
		const take = TAKES[index % TAKES.length];
		if (!take) continue;
		prompts.push(
			[
				basePrompt,
				"",
				`VARIATION (image ${index + 1} of ${safeCount}):`,
				`- Take: ${take.label}.`,
				`- ${take.description}`,
				`- Curtain tone for this variation: ${take.curtainTone}.`,
				"- Fully furnish and style the room to this Take, within the chosen Style.",
			].join("\n")
		);
	}
	return prompts;
}
