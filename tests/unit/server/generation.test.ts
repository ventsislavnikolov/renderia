import { describe, expect, it, vi } from "vitest";

import type { RenovationAiProvider } from "../../../src/lib/ai/types";
import {
	__createDesignBriefHandler,
	__detectProtectedElementsHandler,
} from "../../../src/server/generation";

function buildMockProvider(): RenovationAiProvider & {
	detectProtectedElements: ReturnType<typeof vi.fn>;
	createDesignBrief: ReturnType<typeof vi.fn>;
} {
	const provider = {
		suggestTasks: vi.fn().mockResolvedValue([]),
		detectProtectedElements: vi.fn().mockResolvedValue([
			{
				label: "left window",
				kind: "window",
				x: 0.1,
				y: 0.2,
				width: 0.2,
				height: 0.3,
				confidence: 0.9,
			},
		]),
		createDesignBrief: vi
			.fn()
			.mockResolvedValue({ markdown: "# brief", prompt: "PRESERVE EXACTLY" }),
		generateRenovationImages: vi.fn().mockResolvedValue([]),
	};
	return provider as unknown as RenovationAiProvider & {
		detectProtectedElements: ReturnType<typeof vi.fn>;
		createDesignBrief: ReturnType<typeof vi.fn>;
	};
}

describe("detectProtectedElementsHandler", () => {
	it("delegates to the provider with the validated input", async () => {
		const provider = buildMockProvider();

		const result = await __detectProtectedElementsHandler({
			provider,
			input: {
				photoUrl: "https://example/photo",
				taskTitle: "ceiling",
				notes: "be careful",
			},
		});

		expect(result).toHaveLength(1);
		expect(provider.detectProtectedElements).toHaveBeenCalledWith({
			photoUrl: "https://example/photo",
			taskTitle: "ceiling",
			notes: "be careful",
		});
	});
});

describe("createDesignBriefHandler", () => {
	it("delegates to the provider and returns markdown + prompt", async () => {
		const provider = buildMockProvider();

		const result = await __createDesignBriefHandler({
			provider,
			input: {
				taskTitle: "ceiling",
				styleRules: "scandinavian",
				protectedElements: [
					{
						label: "left window",
						kind: "window",
						x: 0,
						y: 0,
						width: 0.1,
						height: 0.1,
					},
				],
			},
		});

		expect(result).toEqual({ markdown: "# brief", prompt: "PRESERVE EXACTLY" });
		expect(provider.createDesignBrief).toHaveBeenCalledWith(
			expect.objectContaining({
				taskTitle: "ceiling",
				styleRules: "scandinavian",
			}),
		);
	});
});
