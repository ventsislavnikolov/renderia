import type { BoundingBox } from "./types";

export function buildDesignPrompt(input: {
	taskTitle: string;
	styleRules: string;
	briefMarkdown: string;
	protectedElements: BoundingBox[];
}) {
	const preserved = input.protectedElements
		.map(
			(element) =>
				`- ${element.label} (${element.kind}) at x=${element.x}, y=${element.y}, width=${element.width}, height=${element.height}`,
		)
		.join("\n");

	return [
		`Renovation task: ${input.taskTitle}`,
		"",
		"PRESERVE EXACTLY:",
		preserved || "- No protected elements confirmed.",
		"",
		"STYLE AND CHANGE RULES:",
		input.styleRules,
		"",
		"DESIGN BRIEF:",
		input.briefMarkdown,
		"",
		"Generate a realistic visual renovation concept. Do not move, remove, resize, or invent windows, doors, structural edges, ceiling lines, stair openings, or other preserved elements.",
	].join("\n");
}
