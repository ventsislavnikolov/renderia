import { mockRenovationProvider } from "./mock-provider";
import { openAiRenovationProvider } from "./openai-provider";
import type { RenovationAiProvider } from "./types";

/**
 * Picks the active provider implementation:
 *
 * - `mock`: synchronous in-memory provider, used in tests + offline dev.
 *   Ignores any per-call model selection.
 * - any other value: the live AI-SDK-backed provider, which now handles
 *   OpenAI / Google Gemini / Anthropic for text+vision via per-call model
 *   selection. Image generation stays OpenAI-only inside that provider.
 *
 * The legacy `AI_PROVIDER=openai` value is still accepted (it just routes to
 * the live provider) so existing deployments don't break.
 */
export function getRenovationAiProvider(): RenovationAiProvider {
	const provider = process.env.AI_PROVIDER ?? "mock";
	if (provider === "mock") return mockRenovationProvider;
	return openAiRenovationProvider;
}
