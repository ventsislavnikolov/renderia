import { afterEach, describe, expect, it, vi } from "vitest";
import { mockRenovationProvider } from "../../../src/lib/ai/mock-provider";
import { getRenovationAiProvider } from "../../../src/lib/ai/provider";

describe("getRenovationAiProvider", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("returns the mock provider when AI_PROVIDER=mock", () => {
		vi.stubEnv("AI_PROVIDER", "mock");
		expect(getRenovationAiProvider()).toBe(mockRenovationProvider);
	});

	it("throws for AI_PROVIDER=openai until Task 5 lands", () => {
		vi.stubEnv("AI_PROVIDER", "openai");
		expect(() => getRenovationAiProvider()).toThrow(
			"OpenAI provider added in Task 5",
		);
	});

	it("throws for unknown AI_PROVIDER values", () => {
		vi.stubEnv("AI_PROVIDER", "garbage");
		expect(() => getRenovationAiProvider()).toThrow(
			"Unknown AI_PROVIDER: garbage",
		);
	});
});
