// Test-only — do not import from production code.
import { __resetOpenAiClientForTestsInternal } from "./openai-provider";

/**
 * Reset hook for tests. Lives in a sibling `*.test-utils` file so production
 * code never sees it — the SDK's module-level client cache otherwise persists
 * across tests even when the OpenAI constructor itself is mocked.
 */
export function resetOpenAiClientForTests(): void {
	__resetOpenAiClientForTestsInternal();
}
