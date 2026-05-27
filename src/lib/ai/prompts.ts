import type { BoundingBox } from "./types";

const SECTION_HEADER_PATTERN =
	/^(PRESERVE EXACTLY|Brief|Style rules?|Constraints?)\b/i;
// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ASCII control chars is the goal
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

export function buildDesignBriefMarkdown(input: {
	taskTitle: string;
	styleRules: string;
	protectedElements: BoundingBox[];
}) {
	const preserved =
		input.protectedElements.length > 0
			? input.protectedElements
					.map((element) => `- ${protectedElementLine(element)}`)
					.join("\n")
			: "- No protected elements were confirmed. Keep the source photo's visible structural layout stable.";

	return [
		`# ${sanitizePromptField(input.taskTitle)}`,
		"",
		"## Goal",
		`Create a realistic visual renovation concept for ${sanitizePromptField(input.taskTitle)} while preserving the room or facade geometry from the source photo.`,
		"",
		"## Must preserve",
		preserved,
		"",
		"## Allowed changes",
		"- Update finishes, paint, plaster, flooring, trim, lighting, fixtures, furniture, decor, and surface materials.",
		"- Improve cleanliness, mood, and visual polish without changing the architectural layout.",
		"- Keep changes plausible for the photographed space; avoid fantasy architecture or impossible structural changes.",
		"",
		"## Style direction",
		sanitizePromptField(input.styleRules),
		"",
		"## Generation guidance",
		"- Use the supplied source photo as the geometry and composition reference.",
		"- Keep the same camera viewpoint, lens feel, room proportions, wall openings, ceiling lines, stair positions, and major edges.",
		"- Do not move, remove, resize, crop, cover, or invent protected elements.",
		"- Do not add new windows, doors, stairs, skylights, columns, beams, or structural openings unless explicitly requested in the style direction.",
	].join("\n");
}

export function buildDesignPrompt(input: {
	taskTitle: string;
	styleRules: string;
	briefMarkdown: string;
	protectedElements: BoundingBox[];
}) {
	const preserved = input.protectedElements
		.map((element) => `- ${protectedElementLine(element)}`)
		.join("\n");

	return [
		"RENOVATION OBJECTIVE:",
		`Create a realistic visual renovation concept for ${sanitizePromptField(input.taskTitle)}.`,
		"",
		"SOURCE PHOTO FIDELITY:",
		"- Use the supplied source photo as the geometry, camera, and composition reference.",
		"- Keep the same camera viewpoint, room proportions, wall/floor/ceiling planes, opening positions, and major structural edges.",
		"- Preserve lighting direction and perspective unless the style rules explicitly request a small mood change.",
		"",
		"PRESERVE EXACTLY:",
		preserved || "- No protected elements confirmed.",
		"- Do not move, remove, resize, crop, cover, or replace any protected element.",
		"- Do not add new windows, doors, stairs, skylights, columns, beams, or structural openings.",
		"",
		"ALLOWED CHANGES:",
		"- Finishes, colors, plaster, paint, cladding, flooring, trim, lighting fixtures, furniture, decor, and surface materials.",
		"- Clean up visual noise and construction mess while keeping the architecture legible.",
		"",
		"STYLE AND MATERIAL DIRECTION:",
		sanitizePromptField(input.styleRules),
		"",
		"DESIGN BRIEF:",
		sanitizePromptField(input.briefMarkdown),
		"",
		"OUTPUT REQUIREMENTS:",
		"- Photorealistic renovation concept, not a technical drawing.",
		"- Preserve the source photo's layout first; apply style second.",
		"- Avoid impossible geometry, extra openings, warped edges, duplicated windows, or hidden doors.",
	].join("\n");
}
