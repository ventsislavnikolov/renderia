/**
 * Vitest global setup.
 *
 * @testing-library/react only auto-cleans between tests when Vitest is
 * running with `globals: true` (it relies on a global `afterEach`). We keep
 * globals off to avoid polluting the type space, so register the cleanup
 * explicitly here once.
 *
 * `@testing-library/jest-dom/vitest` registers DOM matchers (`toBeInTheDocument`,
 * `toHaveTextContent`, …) on Vitest's `expect` and augments the matcher types.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

function stubBrowserEnv() {
	vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
	vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
}

/**
 * jsdom under Node 24 leaves `window.localStorage` resolving to Node's
 * experimental (and unconfigured) `localStorage` global, so reads throw. Give
 * `window` a real in-memory Storage so consent persistence and any other
 * localStorage-backed code is exercisable in tests.
 */
function installLocalStorage() {
	const store = new Map<string, string>();
	const storage: Storage = {
		get length() {
			return store.size;
		},
		clear: () => store.clear(),
		getItem: (key) => (store.has(key) ? (store.get(key) as string) : null),
		key: (index) => Array.from(store.keys())[index] ?? null,
		removeItem: (key) => {
			store.delete(key);
		},
		setItem: (key, value) => {
			store.set(key, String(value));
		},
	};
	Object.defineProperty(window, "localStorage", {
		configurable: true,
		value: storage,
		writable: true,
	});
}

stubBrowserEnv();

beforeEach(() => {
	stubBrowserEnv();
	installLocalStorage();
	Object.defineProperty(window, "scrollTo", {
		configurable: true,
		value: vi.fn(),
		writable: true,
	});
});

afterEach(() => {
	cleanup();
});
