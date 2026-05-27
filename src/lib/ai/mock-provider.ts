import { buildDesignBriefMarkdown, buildDesignPrompt } from "./prompts";
import type { RenovationAiProvider } from "./types";

// 1x1 transparent PNG, used so mock outputs are renderable as data URLs during dev.
const TRANSPARENT_PNG_BASE64 =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

export const mockRenovationProvider: RenovationAiProvider = {
	async suggestTasks() {
		return {
			value: [
				{
					title: "2nd floor - ceiling",
					category: "ceiling",
					rationale: "Photo suggests ceiling and lighting work.",
				},
				{
					title: "outside facade",
					category: "facade",
					rationale: "Exterior photo suggests facade redesign.",
				},
			],
		};
	},
	async detectProtectedElements() {
		return {
			value: [
				{
					label: "left window",
					kind: "window",
					x: 0.12,
					y: 0.2,
					width: 0.18,
					height: 0.28,
					confidence: 0.82,
				},
				{
					label: "main door",
					kind: "door",
					x: 0.58,
					y: 0.36,
					width: 0.16,
					height: 0.44,
					confidence: 0.76,
				},
			],
		};
	},
	async createDesignBrief(input) {
		const markdown = buildDesignBriefMarkdown({
			taskTitle: input.taskTitle,
			styleRules: input.styleRules,
			protectedElements: input.protectedElements,
		});
		return {
			value: {
				markdown,
				prompt: buildDesignPrompt({
					taskTitle: input.taskTitle,
					styleRules: input.styleRules,
					briefMarkdown: markdown,
					protectedElements: input.protectedElements,
				}),
			},
		};
	},
	async generateRenovationImages(input) {
		return {
			value: Array.from({ length: input.count }, () => ({
				base64: TRANSPARENT_PNG_BASE64,
				contentType: "image/png" as const,
			})),
		};
	},
};
