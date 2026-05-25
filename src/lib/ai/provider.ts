import { mockRenovationProvider } from "./mock-provider";
import type { RenovationAiProvider } from "./types";

export function getRenovationAiProvider(): RenovationAiProvider {
	const provider = process.env.AI_PROVIDER ?? "mock";
	switch (provider) {
		case "mock":
			return mockRenovationProvider;
		case "openai":
			throw new Error("OpenAI provider added in Task 5");
		default:
			throw new Error(`Unknown AI_PROVIDER: ${provider}`);
	}
}
