/**
 * Vitest global setup.
 *
 * @testing-library/react only auto-cleans between tests when Vitest is
 * running with `globals: true` (it relies on a global `afterEach`). We keep
 * globals off to avoid polluting the type space, so register the cleanup
 * explicitly here once.
 */
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

function stubBrowserEnv() {
	vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
	vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
}

stubBrowserEnv();

beforeEach(() => {
	stubBrowserEnv();
	Object.defineProperty(window, "scrollTo", {
		configurable: true,
		value: vi.fn(),
		writable: true,
	});
});

afterEach(() => {
	cleanup();
});
