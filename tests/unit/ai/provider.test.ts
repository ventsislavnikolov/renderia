import { afterEach, describe, expect, it, vi } from "vitest";
import { mockRenovationProvider } from "../../../src/lib/ai/mock-provider";
import { openAiRenovationProvider } from "../../../src/lib/ai/openai-provider";
import { getRenovationAiProvider } from "../../../src/lib/ai/provider";

describe("getRenovationAiProvider", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("returns the mock provider when AI_PROVIDER=mock", () => {
		vi.stubEnv("AI_PROVIDER", "mock");
		expect(getRenovationAiProvider()).toBe(mockRenovationProvider);
	});

	it("returns the openai provider when AI_PROVIDER=openai", () => {
		vi.stubEnv("AI_PROVIDER", "openai");
		expect(getRenovationAiProvider()).toBe(openAiRenovationProvider);
	});

	it("throws for unknown AI_PROVIDER values", () => {
		vi.stubEnv("AI_PROVIDER", "garbage");
		expect(() => getRenovationAiProvider()).toThrow(
			"Unknown AI_PROVIDER: garbage",
		);
	});
});
