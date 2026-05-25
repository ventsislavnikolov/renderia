import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the guided renovation workspace.
 *
 * Tests live in `tests/e2e/` and drive the real Vite dev server. Network calls
 * to Supabase + TanStack server fns are mocked per-test via `page.route()` so
 * the suite stays deterministic regardless of the live Supabase project's
 * state. We reuse an existing dev server locally to keep the inner loop fast;
 * CI always starts a fresh one.
 */
export default defineConfig({
	testDir: "./tests/e2e",
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: 1,
	reporter: process.env.CI ? "list" : "list",
	expect: {
		timeout: 5_000,
	},
	use: {
		baseURL: "http://localhost:3000",
		actionTimeout: 5_000,
		navigationTimeout: 15_000,
		trace: "on-first-retry",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
		{
			name: "mobile",
			use: { ...devices["Pixel 7"] },
		},
	],
	// We run e2e against the production build (`pnpm build && pnpm preview`)
	// rather than the dev server. The dev server pulls in the TanStack
	// devtools, which transitively depends on `solid-js` from a nested
	// `node_modules`; Vite's dependency optimizer can't resolve that import
	// from the root and surfaces a blocking error overlay on first navigation
	// to the task workspace route. The production build is devtools-free, so
	// preview is the deterministic surface for these tests. We rebuild on
	// every run so we never test stale output.
	webServer: {
		command: "pnpm build && pnpm preview",
		url: "http://localhost:3000",
		reuseExistingServer: !process.env.CI,
		timeout: 300_000,
		stdout: "ignore",
		stderr: "pipe",
	},
});
