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

export function buildDesignPrompt(input: {
	taskTitle: string;
	styleRules: string;
	briefMarkdown: string;
	protectedElements: BoundingBox[];
}) {
	const preserved = input.protectedElements
		.map(
			(element) =>
				`- ${sanitizePromptField(element.label)} (${sanitizePromptField(element.kind)}) at x=${element.x}, y=${element.y}, width=${element.width}, height=${element.height}`,
		)
		.join("\n");

	return [
		`Renovation task: ${sanitizePromptField(input.taskTitle)}`,
		"",
		"PRESERVE EXACTLY:",
		preserved || "- No protected elements confirmed.",
		"",
		"STYLE AND CHANGE RULES:",
		sanitizePromptField(input.styleRules),
		"",
		"DESIGN BRIEF:",
		sanitizePromptField(input.briefMarkdown),
		"",
		"Generate a realistic visual renovation concept. Do not move, remove, resize, or invent windows, doors, structural edges, ceiling lines, stair openings, or other preserved elements.",
	].join("\n");
}
