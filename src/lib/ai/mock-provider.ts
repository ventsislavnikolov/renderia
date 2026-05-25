import { buildDesignPrompt } from "./prompts";
import type { RenovationAiProvider } from "./types";

export const mockRenovationProvider: RenovationAiProvider = {
	async suggestTasks() {
		return [
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
		];
	},
	async detectProtectedElements() {
		return [
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
		];
	},
	async createDesignBrief(input) {
		const markdown = `# ${input.taskTitle}\n\nPreserve confirmed fixed elements and apply ${input.styleRules}.`;
		return {
			markdown,
			prompt: buildDesignPrompt({
				taskTitle: input.taskTitle,
				styleRules: input.styleRules,
				briefMarkdown: markdown,
				protectedElements: input.protectedElements,
			}),
		};
	},
	async generateRenovationImages(input) {
		return Array.from({ length: input.count }, () => ({
			base64: "",
			contentType: "image/png" as const,
		}));
	},
};
