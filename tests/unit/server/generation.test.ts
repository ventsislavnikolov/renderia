import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RenovationAiProvider } from "../../../src/lib/ai/types";
import {
	__createDesignBriefHandler,
	__detectProtectedElementsHandler,
} from "../../../src/server/generation";

const SAMPLE_DEBUG = {
	model: "gpt-5",
	prompt: "test prompt",
	rawResponse: '{"ok":true}',
	durationMs: 12,
};

function buildMockProvider(): RenovationAiProvider & {
	detectProtectedElements: ReturnType<typeof vi.fn>;
	createDesignBrief: ReturnType<typeof vi.fn>;
} {
	const provider = {
		suggestTasks: vi.fn().mockResolvedValue({ value: [] }),
		detectProtectedElements: vi.fn().mockResolvedValue({
			value: [
				{
					label: "left window",
					kind: "window",
					x: 0.1,
					y: 0.2,
					width: 0.2,
					height: 0.3,
					confidence: 0.9,
				},
			],
			debug: SAMPLE_DEBUG,
		}),
		createDesignBrief: vi.fn().mockResolvedValue({
			value: { markdown: "# brief", prompt: "PRESERVE EXACTLY" },
			debug: SAMPLE_DEBUG,
		}),
		generateRenovationImages: vi.fn().mockResolvedValue({ value: [] }),
	};
	return provider as unknown as RenovationAiProvider & {
		detectProtectedElements: ReturnType<typeof vi.fn>;
		createDesignBrief: ReturnType<typeof vi.fn>;
	};
}

const originalNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
	// Default to 'test' (non-production) so debug payloads are forwarded.
	process.env.NODE_ENV = "test";
});

afterEach(() => {
	process.env.NODE_ENV = originalNodeEnv;
});

describe("detectProtectedElementsHandler", () => {
	it("returns the bounding boxes under `data` with the debug payload attached in dev", async () => {
		const provider = buildMockProvider();

		const result = await __detectProtectedElementsHandler({
			provider,
			input: {
				photoUrl: "https://example/photo",
				taskTitle: "ceiling",
				notes: "be careful",
			},
		});

		expect(result.data).toHaveLength(1);
		expect(result.debug).toEqual(SAMPLE_DEBUG);
		expect(provider.detectProtectedElements).toHaveBeenCalledWith({
			photoUrl: "https://example/photo",
			taskTitle: "ceiling",
			notes: "be careful",
		});
	});

	it("strips the debug payload in production", async () => {
		process.env.NODE_ENV = "production";
		const provider = buildMockProvider();

		const result = await __detectProtectedElementsHandler({
			provider,
			input: { photoUrl: "https://example/photo", taskTitle: "ceiling" },
		});

		expect(result.data).toHaveLength(1);
		expect("debug" in result).toBe(false);
	});
});

describe("createDesignBriefHandler", () => {
	it("delegates to the provider and returns markdown + prompt under data with debug in dev", async () => {
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

		expect(result.data).toEqual({
			markdown: "# brief",
			prompt: "PRESERVE EXACTLY",
		});
		expect(result.debug).toEqual(SAMPLE_DEBUG);
		expect(provider.createDesignBrief).toHaveBeenCalledWith(
			expect.objectContaining({
				taskTitle: "ceiling",
				styleRules: "scandinavian",
			}),
		);
	});
});
