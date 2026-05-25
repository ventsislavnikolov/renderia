import { describe, expect, it } from "vitest";
import { buildDesignPrompt } from "../../../src/lib/ai/prompts";

describe("buildDesignPrompt", () => {
	it("always includes confirmed protected elements", () => {
		const prompt = buildDesignPrompt({
			taskTitle: "2nd floor - ceiling",
			styleRules: "Scandinavian renovation style",
			briefMarkdown: "Improve ceiling finish and lighting.",
			protectedElements: [
				{
					label: "left window",
					kind: "window",
					x: 0.1,
					y: 0.2,
					width: 0.2,
					height: 0.3,
				},
				{
					label: "main door",
					kind: "door",
					x: 0.55,
					y: 0.35,
					width: 0.15,
					height: 0.45,
				},
			],
		});

		expect(prompt).toContain("PRESERVE EXACTLY");
		expect(prompt).toContain("left window");
		expect(prompt).toContain("main door");
		expect(prompt).toContain("Scandinavian renovation style");
	});
});
