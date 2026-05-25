import { mockRenovationProvider } from "./mock-provider";
import { openAiRenovationProvider } from "./openai-provider";
import type { RenovationAiProvider } from "./types";

export function getRenovationAiProvider(): RenovationAiProvider {
	const provider = process.env.AI_PROVIDER ?? "mock";
	switch (provider) {
		case "mock":
			return mockRenovationProvider;
		case "openai":
			return openAiRenovationProvider;
		default:
			throw new Error(`Unknown AI_PROVIDER: ${provider}`);
	}
}
