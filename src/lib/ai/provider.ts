import { mockRenovationProvider } from "./mock-provider";
import type { RenovationAiProvider } from "./types";

export function getRenovationAiProvider(): RenovationAiProvider {
	if ((process.env.AI_PROVIDER ?? "mock") === "openai") {
		throw new Error("OpenAI provider is added in the next task");
	}
	return mockRenovationProvider;
}
