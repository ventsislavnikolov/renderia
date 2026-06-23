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
		"- Choose either light curtains (white, off-white, beige, linen, light grey) or darker curtains (taupe, warm grey, charcoal, muted brown), as instructed by this variation's curtain tone.",
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

export const JAPANDI_PRESET: StylePreset = {
	id: "japandi",
	label: "Japandi",
	summary:
		"Scandinavian × Japanese calm — warm wood, low furniture, sparse and serene.",
	aesthetic: "Japandi",
	doorRule: [
		"- Door openings stay in place. Door panels may be replaced with low-contrast warm-wood doors or shoji-inspired panelled doors.",
		"- Matte black or dark bronze hardware; sliding doors where the opening suits them.",
	],
	windowRule: [
		"- Remove any blinds. Keep windows minimal: bare, or floor-length natural linen in oatmeal, greige, or warm white.",
		"- A soft paper-screen quality suits the look; keep contrast low and fabric unfussy.",
	],
	flooringRule: [
		"- Do not keep the current floor. Use warm matte oak or engineered wood in a light-to-mid tone; no gloss.",
		"- A low-pile natural-fibre or tatami-inspired textured rug is welcome.",
	],
	wallCeilingRule: [
		"- Warm white, soft clay, or muted greige walls; one limewash or natural-plaster textured accent wall is allowed.",
		"- Keep ceilings warm white and calm; avoid stark cool white.",
	],
	furnitureRule: [
		"- Fully furnish the room. Empty rooms are not acceptable.",
		"- Low-slung wooden pieces in oak or walnut, woven cane, ceramics, and linen; sparse and intentional.",
		"- Low tables, floor cushions, simple paper or ceramic lighting, matte black accents.",
		"- No clutter, no high-gloss, no ornate Western furniture.",
	],
	visualStyle:
		"Photorealistic architectural renovation render. Soft diffused daylight, realistic proportions, calm minimalist Japandi interior, natural warm materials, serene and uncluttered.",
	negativeStyle: [
		"- Do not use blinds, high-gloss surfaces, or bright saturated colors.",
		"- Do not over-decorate or use ornate Western furniture.",
		"- Do not leave the room empty or unfurnished.",
	],
};

export const MIDCENTURY_PRESET: StylePreset = {
	id: "midcentury",
	label: "Mid-century modern",
	summary:
		"Retro 50s–60s — teak and walnut, tapered legs, organic forms, bold accents.",
	aesthetic: "mid-century modern",
	doorRule: [
		"- Door openings stay in place. Door panels may be replaced with flush teak/walnut doors or vertical-slat wood doors.",
		"- Brushed brass or slim matte-black hardware.",
	],
	windowRule: [
		"- Remove any blinds. Use simple floor-length drapery in mustard, olive, or warm neutral, or leave windows bare with clean frames.",
		"- Keep window dressing unfussy — no heavy swags.",
	],
	flooringRule: [
		"- Do not keep the current floor. Use warm medium-tone wood (teak or walnut) or terrazzo.",
		"- A geometric or shag area rug reinforces the era.",
	],
	wallCeilingRule: [
		"- Warm white walls with one bold accent wall (olive, burnt orange, or teal); wood paneling is allowed.",
		"- Keep the ceiling light; recessed or statement globe lighting suits the look.",
	],
	furnitureRule: [
		"- Fully furnish the room. Empty rooms are not acceptable.",
		"- Tapered-leg wooden furniture, organic curves, low sideboards and credenzas in teak or walnut.",
		"- Leather and bold-upholstery seating, sputnik or globe lighting, characterful but not cluttered.",
		"- No ornate traditional pieces and no cold industrial metal.",
	],
	visualStyle:
		"Photorealistic architectural renovation render. Warm afternoon light, realistic proportions, retro 1950s–60s mid-century modern interior, organic forms, characterful and inviting.",
	negativeStyle: [
		"- Do not use blinds, ornate traditional furniture, or chrome industrial fittings.",
		"- Do not use pale minimalist or pastel styling.",
		"- Do not leave the room empty or unfurnished.",
	],
};

export const MINIMALIST_PRESET: StylePreset = {
	id: "minimalist",
	label: "Minimalist",
	summary:
		"Monochrome and seamless — handleless surfaces, hidden storage, no clutter.",
	aesthetic: "minimalist modern",
	doorRule: [
		"- Door openings stay in place. Door panels may be replaced with flush, handleless push-to-open doors in matte white or pale wood.",
		"- Hardware concealed; keep surfaces seamless.",
	],
	windowRule: [
		"- Remove any blinds. Use floor-to-ceiling sheer white panels on recessed tracks, or leave windows clean and bare.",
		"- Keep the window line uninterrupted and monochrome.",
	],
	flooringRule: [
		"- Do not keep the current floor. Use large-format pale concrete, microcement, or wide light wood; seamless and matte.",
		"- A single low-pile neutral rug at most.",
	],
	wallCeilingRule: [
		"- Monochrome white or warm grey walls with a seamless plaster finish; no ornament.",
		"- Keep storage concealed; ceilings flush and uninterrupted.",
	],
	furnitureRule: [
		"- Fully furnish the room. Empty rooms are not acceptable.",
		"- Clean low-profile pieces, fully concealed storage, a strictly monochrome palette.",
		"- A single sculptural accent piece is allowed; quality over quantity, no visible clutter.",
		"- No patterns, no ornate detailing, no warm rustic textures.",
	],
	visualStyle:
		"Photorealistic architectural renovation render. Even soft daylight, realistic proportions, serene minimalist modern interior, clean lines and a restrained monochrome palette.",
	negativeStyle: [
		"- Do not use blinds, visible clutter, or busy patterns.",
		"- Do not use ornate detailing or heavy rustic textures.",
		"- Do not leave the room empty or unfurnished.",
	],
};

export const COASTAL_PRESET: StylePreset = {
	id: "coastal",
	label: "Coastal",
	summary:
		"Breezy Mediterranean — whitewashed surfaces, blue accents, rattan and linen.",
	aesthetic: "coastal Mediterranean",
	doorRule: [
		"- Door openings stay in place. Door panels may be replaced with white or pale-blue panelled doors, or natural light wood.",
		"- Simple brushed-metal or ceramic hardware.",
	],
	windowRule: [
		"- Remove any blinds. Use breezy white or pale-blue linen and cotton curtains, or light sheers; louvered shutters are an option.",
		"- Keep everything airy and light.",
	],
	flooringRule: [
		"- Do not keep the current floor. Use whitewashed wood, pale terracotta, or natural stone tile.",
		"- A jute or sisal rug suits the look.",
	],
	wallCeilingRule: [
		"- Bright white or lime-washed walls with soft blue accents; natural plaster textures are welcome.",
		"- Light exposed beams are allowed; keep the ceiling bright.",
	],
	furnitureRule: [
		"- Fully furnish the room. Empty rooms are not acceptable.",
		"- Light natural rattan and wicker, white slipcovered seating, blue-and-white textiles.",
		"- Driftwood, woven baskets, ceramics, and rope details; relaxed and airy.",
		"- No dark heavy wood and no industrial metal.",
	],
	visualStyle:
		"Photorealistic architectural renovation render. Bright airy seaside daylight, realistic proportions, fresh coastal Mediterranean interior, natural textures, breezy and light.",
	negativeStyle: [
		"- Do not use blinds, dark heavy wood, or industrial metal.",
		"- Do not use a moody or dark palette.",
		"- Do not leave the room empty or unfurnished.",
	],
};

export const RUSTIC_PRESET: StylePreset = {
	id: "rustic",
	label: "Rustic farmhouse",
	summary:
		"Cozy and lived-in — aged wood, shiplap, exposed beams, handcrafted pieces.",
	aesthetic: "rustic farmhouse",
	doorRule: [
		"- Door openings stay in place. Door panels may be replaced with reclaimed or distressed wood doors, or a barn-style sliding door.",
		"- Wrought-iron or aged-metal hardware.",
	],
	windowRule: [
		"- Remove any blinds. Use gingham, linen, or cotton curtains in warm neutrals on simple wooden rods.",
		"- Keep window dressing homely and unfussy.",
	],
	flooringRule: [
		"- Do not keep the current floor. Use wide reclaimed or aged wood planks in a warm mid-to-dark tone, or stone tile.",
		"- A woven or braided rug suits the look.",
	],
	wallCeilingRule: [
		"- Warm white or cream walls; shiplap paneling and one stone or exposed-brick accent are welcome.",
		"- Exposed wood ceiling beams reinforce the look.",
	],
	furnitureRule: [
		"- Fully furnish the room. Empty rooms are not acceptable.",
		"- Solid aged-wood farmhouse furniture, slipcovered seating, vintage and handcrafted pieces.",
		"- Woven baskets, wrought iron, ceramic crocks; cozy and lived-in.",
		"- No sleek glossy surfaces and no chrome minimalism.",
	],
	visualStyle:
		"Photorealistic architectural renovation render. Warm golden daylight, realistic proportions, cozy rustic farmhouse interior, aged natural materials, homely and welcoming.",
	negativeStyle: [
		"- Do not use blinds, sleek glossy surfaces, or chrome minimalist fittings.",
		"- Do not use bright synthetic colors.",
		"- Do not leave the room empty or unfurnished.",
	],
};

export const BOHO_PRESET: StylePreset = {
	id: "boho",
	label: "Boho",
	summary:
		"Lush and layered — rattan, macramé, plants, warm earthy and jewel tones.",
	aesthetic: "bohemian",
	doorRule: [
		"- Door openings stay in place. Door panels may be replaced with natural or arched wood doors; carved-wood detailing is welcome.",
		"- Warm brass or aged-bronze hardware.",
	],
	windowRule: [
		"- Remove any blinds. Use layered patterned textiles, macramé, and sheer warm-toned curtains; tassels and fringing suit the look.",
		"- Layering is encouraged here, unlike the more restrained Styles.",
	],
	flooringRule: [
		"- Do not keep the current floor. Use warm wood or terracotta, layered with patterned kilim, Persian, or shag rugs.",
		"- Layered rugs are part of the look.",
	],
	wallCeilingRule: [
		"- Warm white, terracotta, or one rich jewel-tone accent wall; gallery walls, tapestries, and macramé hangings are welcome.",
		"- Keep the ceiling warm; hanging plants and rattan pendants suit the look.",
	],
	furnitureRule: [
		"- Fully furnish the room. Empty rooms are not acceptable.",
		"- An eclectic layered mix: rattan and carved wood, floor cushions and poufs, low seating, vintage finds.",
		"- Abundant plants, warm earthy and jewel tones, and lots of texture and pattern.",
		"- No stark minimalism and no sleek corporate furniture.",
	],
	visualStyle:
		"Photorealistic architectural renovation render. Warm ambient light, realistic proportions, lush layered bohemian interior, rich textures and patterns, eclectic and cozy.",
	negativeStyle: [
		"- Do not use blinds, stark minimalism, or a cold monochrome palette.",
		"- Do not use sleek corporate furniture.",
		"- Do not leave the room empty or unfurnished.",
	],
};

/**
 * Style catalogue. Scandinavian is the default; the rest are first-pass
 * vocabularies, tuned iteratively against real renders. Order here is the
 * order the picker lists them.
 */
export const STYLE_PRESETS: readonly StylePreset[] = [
	SCANDINAVIAN_PRESET,
	INDUSTRIAL_PRESET,
	JAPANDI_PRESET,
	MIDCENTURY_PRESET,
	MINIMALIST_PRESET,
	COASTAL_PRESET,
	RUSTIC_PRESET,
	BOHO_PRESET,
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
