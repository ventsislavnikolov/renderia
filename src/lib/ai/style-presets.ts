/**
 * Style presets — the parameterized *aesthetic* layer of the design prompt.
 *
 * `buildDesignPrompt` is split into two concerns (see
 * docs/adr/0004-parameterized-style-presets.md):
 *
 *   1. a universal **fidelity layer** (keep windows, doors, walls, radiators,
 *      and room geometry where the source shows them) that lives in
 *      `prompts.ts` and applies under *every* Style; and
 *   2. this **Style layer** — palette, materials, furniture vocabulary, and the
 *      door/window/flooring/wall renovation rules that differ per aesthetic.
 *
 * A `StylePreset` carries only the style-variable text. Adding a Style is one
 * catalogue entry here; no edit to the prompt builder. The glossary terms are
 * **Style** (this preset) and **Style Direction** (the user's free-text
 * refinement layered on top) — see CONTEXT.md.
 *
 * Scandinavian is the carried-over content the prompt was hardcoded to and is
 * the default. The remaining presets are first-pass vocabularies, refined
 * iteratively against real renders (the deep tuning cannot be done without
 * seeing how `gpt-image-2` reacts to the words).
 */

export type StylePreset = {
	/** Stable id stored on `renovation_tasks.style` and used in the picker. */
	id: string;
	/** User-facing picker label. */
	label: string;
	/** One-line picker description. */
	summary: string;
	/**
	 * Aesthetic adjective phrase spliced into the objective/goal/visual lines
	 * (e.g. "Scandinavian", "industrial loft"). Keep it short.
	 */
	aesthetic: string;
	/** Door-panel renovation guidance (openings always stay; see fidelity layer). */
	doorRule: string[];
	/** Window dressing / curtain guidance. */
	windowRule: string[];
	/** Flooring replacement guidance. */
	flooringRule: string[];
	/** Wall + ceiling colour/treatment guidance. */
	wallCeilingRule: string[];
	/** Furniture vocabulary the render must draw from. */
	furnitureRule: string[];
	/** One-line photoreal visual-style descriptor. */
	visualStyle: string;
	/** Style-specific "do not" lines (architectural negatives live in the fidelity layer). */
	negativeStyle: string[];
};

export const SCANDINAVIAN_PRESET: StylePreset = {
	id: "scandinavian",
	label: "Scandinavian",
	summary:
		"Bright, budget-friendly Nordic — white walls, light oak, IKEA/JYSK pieces.",
	aesthetic: "Scandinavian",
	doorRule: [
		"- Door openings stay in place. Door panels may be replaced with new Scandinavian interior doors.",
		"- Prefer simple white, off-white, light wood, or pale oak finishes. JYSK / IKEA aesthetic.",
	],
	windowRule: [
		"- Remove any blinds from the source photo. Always use realistic Scandinavian curtains.",
		"- Choose either light curtains (white, off-white, beige, linen, light grey) or darker curtains (taupe, warm grey, charcoal, muted brown), as instructed by the variation concept.",
	],
	flooringRule: [
		"- Do not keep the current floor. Use new Scandinavian laminate: whitewashed oak, off-white oak, light ash, soft greige, or pale natural wood. No dark heavy wood.",
	],
	wallCeilingRule: [
		"- White walls as the main color. White or very-light ceiling. Small Scandinavian accent details allowed.",
		"- No dark wall colors or heavy decorative wall treatments.",
	],
	furnitureRule: [
		"- Fully furnish the room. Empty rooms are not acceptable.",
		"- Use only furniture that looks like real IKEA or JYSK products: affordable, ready-made, clean-lined Scandinavian pieces.",
		"- Light oak, pale wood, beige, grey, black metal accents, woven baskets, simple lamps, rugs, cushions, curtains, practical storage.",
		"- No luxury custom-made or dramatic non-Scandinavian furniture.",
	],
	visualStyle:
		"Photorealistic architectural renovation render. Realistic daylight, realistic proportions, cozy and budget-friendly Scandinavian interior, practical and buildable.",
	negativeStyle: [
		"- Do not use blinds, dark heavy flooring, or non-Scandinavian style.",
		"- Do not use luxury furniture or pieces that do not look like JYSK / IKEA.",
		"- Do not leave the room empty or unfurnished.",
	],
};

export const INDUSTRIAL_PRESET: StylePreset = {
	id: "industrial",
	label: "Industrial",
	summary:
		"Warehouse loft — exposed brick, concrete, black metal, aged leather, Edison lighting.",
	aesthetic: "industrial loft",
	doorRule: [
		"- Door openings stay in place. Door panels may be replaced with industrial-style doors.",
		"- Prefer black steel frames, reeded or wired glass, or solid dark-stained wood. Visible metal hardware is welcome.",
	],
	windowRule: [
		"- Remove any blinds. Leave windows bare or use simple unadorned panels in charcoal, rust, or natural canvas.",
		"- Black metal framing on the glazing reinforces the look; avoid soft floaty drapery.",
	],
	flooringRule: [
		"- Do not keep the current floor. Use polished or sealed concrete, or wide reclaimed/dark-stained wood planks.",
		"- Matte, slightly worn finishes read as authentic; avoid glossy domestic laminate.",
	],
	wallCeilingRule: [
		"- Favour exposed brick, raw or microcement-finished concrete, and dark grey or charcoal accent walls; one plastered white wall is allowed for contrast.",
		"- Ceilings may show exposed ducting, conduit, or beams. Avoid pristine smooth white-box finishes.",
	],
	furnitureRule: [
		"- Fully furnish the room. Empty rooms are not acceptable.",
		"- Black metal and reclaimed-wood pieces, aged tan or cognac leather, factory/task lighting, metal shelving, riveted or pipe-frame details.",
		"- Edison-bulb and caged fixtures, wheeled or trestle tables, utilitarian storage.",
		"- No pastel, no ornate or delicate pieces, no glossy lacquered furniture.",
	],
	visualStyle:
		"Photorealistic architectural renovation render. Moody directional daylight, realistic proportions, warehouse-loft industrial interior, raw materials, practical and buildable.",
	negativeStyle: [
		"- Do not use blinds, pale glossy laminate, or soft pastel Scandinavian style.",
		"- Do not use ornate, delicate, or lacquered luxury furniture.",
		"- Do not leave the room empty or unfurnished.",
	],
};

/**
 * Style catalogue. The first six remaining presets (Japandi, Mid-century,
 * Minimalist, Coastal, Rustic, Boho) are added in a follow-up — this spine
 * ships Scandinavian + Industrial to prove the parameterization end-to-end.
 */
export const STYLE_PRESETS: readonly StylePreset[] = [
	SCANDINAVIAN_PRESET,
	INDUSTRIAL_PRESET,
] as const;

export const DEFAULT_STYLE_ID = SCANDINAVIAN_PRESET.id;

/**
 * Resolve a stored style id to its preset, falling back to the default. The
 * fallback keeps legacy briefs and any unknown/renamed id rendering rather
 * than throwing mid-generation.
 */
export function findStylePreset(styleId?: string | null): StylePreset {
	if (!styleId) return SCANDINAVIAN_PRESET;
	return (
		STYLE_PRESETS.find((preset) => preset.id === styleId) ?? SCANDINAVIAN_PRESET
	);
}
