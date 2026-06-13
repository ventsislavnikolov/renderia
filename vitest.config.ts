import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@": "/src",
		},
	},
	test: {
		environment: "jsdom",
		setupFiles: ["./tests/setup.ts"],
		// Playwright specs live under `tests/e2e/` and import from
		// `@playwright/test`, which calls `test.describe()` outside of the
		// Playwright runner — vitest would otherwise pick them up and crash.
		exclude: [
			"**/node_modules/**",
			"**/dist/**",
			"**/.claude/**",
			// Sandcastle bind-mounts agent worktrees here mid-run; their
			// in-progress trees would otherwise be picked up as our tests.
			"**/.sandcastle/**",
			"**/tests/e2e/**",
		],
	},
});
