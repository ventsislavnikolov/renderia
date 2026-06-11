import type { RoomObject } from "../renovation/room-state";
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

function formatPercent(value: number): string {
	return `${Number((value * 100).toFixed(1))}%`;
}

function protectedElementLine(element: BoundingBox): string {
	return `${sanitizePromptField(element.label)} (${sanitizePromptField(element.kind)}) bbox left=${formatPercent(element.x)}, top=${formatPercent(element.y)}, width=${formatPercent(element.width)}, height=${formatPercent(element.height)}`;
}

function roomObjectLine(object: RoomObject): string {
	const modeLine =
		object.preservationMode === "keep_type_restyle"
			? "same opening and footprint, but may be redesigned in a neutral updated style"
			: "keep the same identity, placement, and visible form";
	return `- ${sanitizePromptField(object.label)} (${sanitizePromptField(object.kind)}) mode=${object.preservationMode}; ${modeLine}. Evidence views: ${object.appearanceIds.length}.`;
}

/**
 * Ordered concept catalogue used to differentiate the four variations.
 *
 * Each entry pairs a short label (used in the brief markdown so the user
 * can read what they're getting) with a fuller renovation directive that
 * gets appended to the per-image prompt. Order matters: variation 0 is the
 * living room, variation 1 the bedroom, etc. — matches the user's
 * reference brief so favorites stay meaningful across re-runs.
 */
export const VARIATION_CONCEPTS = [
	{
		label: "Cozy Scandinavian living room",
		curtainTone: "light",
		description:
			"Cozy Scandinavian living room. Comfortable sofa, soft area rug, a low coffee table, a side armchair, simple wall art, indoor plants, and warm task lighting. Light linen or off-white curtains. Keep circulation clear of doors, windows, and radiators.",
	},
	{
		label: "Warm Scandinavian bedroom / guest bedroom",
		curtainTone: "light",
		description:
			"Warm Scandinavian bedroom or guest bedroom. Low platform or simple-framed bed with neutral linen bedding, a bedside table with a soft lamp, a small wardrobe or storage unit, a textured throw, and a small rug. White or off-white curtains. Keep the bed away from radiators and from blocking door swings.",
	},
	{
		label: "Practical home office / hobby room",
		curtainTone: "dark",
		description:
			"Practical home office or hobby room. A simple desk facing or beside the window, an ergonomic but plain chair, an open shelving unit, a pinboard or small art piece, a desk lamp, and a soft floor rug. Use taupe or warm grey curtains. Keep the workspace lit by daylight without blocking the window.",
	},
	{
		label:
			"Multifunctional room with storage, guest sleeping option, and cozy seating",
		curtainTone: "dark",
		description:
			"Multifunctional room. A daybed or sofa-bed for guests, modular storage units along one wall, a small folding table or compact desk, baskets for soft storage, and a cozy reading corner with a floor lamp. Use charcoal or muted earthy curtains. Layout must accommodate both seating and overnight sleeping.",
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
}) {
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

	const concepts = VARIATION_CONCEPTS.map(
		(concept, index) =>
			`${index + 1}. **${sanitizePromptField(concept.label)}** — ${sanitizePromptField(concept.description)}`
	).join("\n");

	return [
		`# ${sanitizePromptField(input.taskTitle)}`,
		"",
		"## Goal",
		`Create 4 realistic, fully furnished Scandinavian renovation concepts for ${sanitizePromptField(input.taskTitle)} that look like the same real room after renovation — not a different room.`,
		"",
		"## Must preserve",
		preserved,
		"- Window positions, sizes, and walls (do not move, resize, or invent).",
		"- Door openings (positions, sizes, walls). Door panels may be replaced with Scandinavian-style interior doors.",
		"- Radiator positions.",
		"- Room shape, proportions, ceiling height, corners, niches, beams, columns, stairs, slopes.",
		"- Camera angle and perspective matching the source photo.",
		"",
		"## Renovation rules",
		"- **Doors**: replace panels with simple Scandinavian doors in white, off-white, light wood, or pale oak. Keep openings in place.",
		"- **Windows**: remove any blinds. Always use realistic Scandinavian curtains. Mix two light-curtain concepts with two darker-curtain concepts.",
		"- **Flooring**: replace existing laminate with new Scandinavian laminate — whitewashed oak, off-white oak, light ash, soft greige, or pale natural wood.",
		"- **Walls / ceiling**: white walls and white-or-very-light ceiling. Small accent details allowed.",
		"- **Furniture**: only IKEA / JYSK-style affordable Scandinavian pieces — clean lines, light oak, pale wood, beige, grey, simple lamps, woven baskets, rugs, cushions.",
		"- **Lighting and decor**: photorealistic daylight, soft task lighting, indoor plants, simple wall art.",
		"",
		"## Style direction (override layer)",
		sanitizePromptField(input.styleRules),
		"",
		"## Variation concepts",
		concepts,
		"",
		"## Generation guidance",
		"- Use the source photo as the geometry and composition reference.",
		"- Keep the same camera viewpoint, lens feel, room proportions, wall openings, ceiling lines, stair positions, and major edges.",
		"- Do not block windows, doors, or radiators with furniture.",
		"- Avoid luxury custom-made furniture and dramatic non-Scandinavian design.",
	].join("\n");
}

/**
 * Base image-generation prompt. Holds the architectural rules, source-photo
 * fidelity requirements, the renovation playbook, and the negative
 * instructions. Per-variation concept text is appended later by
 * `buildConceptVariationPrompts` — keeping the base/per-concept split
 * means the four images share the same room and rules, only the brief
 * differs.
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
}) {
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
		`Using the source photo as reference, create a realistic Scandinavian renovation render for ${sanitizePromptField(input.taskTitle)}. The output must look like the same real room after renovation, not a different room.`,
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
		"DOOR RENOVATION RULE:",
		"- Door openings stay in place. Door panels may be replaced with new Scandinavian interior doors.",
		"- Prefer simple white, off-white, light wood, or pale oak finishes. JYSK / IKEA aesthetic.",
		"",
		"WINDOW TREATMENT RULE:",
		"- Remove any blinds from the source photo. Always use realistic Scandinavian curtains.",
		"- Choose either light curtains (white, off-white, beige, linen, light grey) or darker curtains (taupe, warm grey, charcoal, muted brown), as instructed by the variation concept.",
		"",
		"FLOORING / LAMINATE RULE:",
		"- Do not keep the current floor. Use new Scandinavian laminate: whitewashed oak, off-white oak, light ash, soft greige, or pale natural wood. No dark heavy wood.",
		"",
		"WALL / CEILING RULE:",
		"- White walls as the main color. White or very-light ceiling. Small Scandinavian accent details allowed.",
		"- No dark wall colors or heavy decorative wall treatments.",
		"",
		"FURNITURE REQUIREMENTS:",
		"- Fully furnish the room. Empty rooms are not acceptable.",
		"- Use only furniture that looks like real IKEA or JYSK products: affordable, ready-made, clean-lined Scandinavian pieces.",
		"- Light oak, pale wood, beige, grey, black metal accents, woven baskets, simple lamps, rugs, cushions, curtains, practical storage.",
		"- No luxury custom-made or dramatic non-Scandinavian furniture.",
		"",
		"STYLE AND MATERIAL DIRECTION (user override layer):",
		sanitizePromptField(input.styleRules),
		"",
		"DESIGN BRIEF:",
		sanitizePromptField(input.briefMarkdown),
		"",
		"VISUAL STYLE:",
		"Photorealistic architectural renovation render. Realistic daylight, realistic proportions, cozy and budget-friendly Scandinavian interior, practical and buildable.",
		"",
		"NEGATIVE INSTRUCTIONS:",
		"- Do not change the position of windows, doors, or radiators.",
		"- Do not invent extra openings, walls, or architectural features.",
		"- Do not redesign the room into a different shape or size.",
		"- Do not block windows, doors, or radiators with furniture.",
		"- Do not use blinds, dark heavy flooring, or non-Scandinavian style.",
		"- Do not use luxury furniture or pieces that do not look like JYSK / IKEA.",
		"- Do not leave the room empty or unfurnished.",
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
 * Prompt section describing furniture reference images that accompany the
 * source photo in image-edit mode. The first input image is always the room;
 * every following image is one furniture piece the design must include.
 * Appended to each variation prompt by the generation server fn so adding
 * furniture never requires regenerating the design brief.
 */
export function buildFurnitureReferenceSection(labels: string[]): string {
	if (labels.length === 0) return "";
	return [
		"FURNITURE TO INCLUDE (mandatory):",
		"- Input images after the first are furniture references, NOT room geometry. Only the first image defines the room.",
		...labels.map(
			(label, index) =>
				`- Reference image ${index + 2}: ${sanitizePromptField(label)}. This exact piece must appear in the room, prominently and recognizably, matching its real shape, color, and material.`
		),
		"- Place each referenced piece naturally within the room layout. Do not duplicate a referenced piece multiple times.",
		"- Do not copy backgrounds, walls, floors, or other objects from the reference images.",
	].join("\n");
}

/**
 * Expand the base prompt into N per-variation prompts. Each variation
 * appends the concept-specific directive from `VARIATION_CONCEPTS` so the
 * provider can be called N times with different concept text but identical
 * architectural and renovation rules.
 *
 * Wraps the concept index: if the caller asks for more variations than
 * concepts exist, later variations reuse earlier concepts (rare; the
 * current schema caps `count` at 4 which matches the catalogue length).
 */
export function buildConceptVariationPrompts(
	basePrompt: string,
	count: number
): string[] {
	const safeCount = Math.max(1, Math.min(count, 8));
	const prompts: string[] = [];
	for (let index = 0; index < safeCount; index += 1) {
		const concept = VARIATION_CONCEPTS[index % VARIATION_CONCEPTS.length];
		if (!concept) continue;
		prompts.push(
			[
				basePrompt,
				"",
				`VARIATION CONCEPT (image ${index + 1} of ${safeCount}):`,
				`- Room type: ${concept.label}.`,
				`- ${concept.description}`,
				`- Curtain tone for this variation: ${concept.curtainTone}.`,
				"- The room must be fully furnished and styled to this concept.",
			].join("\n")
		);
	}
	return prompts;
}
