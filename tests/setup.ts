/**
 * Vitest global setup.
 *
 * @testing-library/react only auto-cleans between tests when Vitest is
 * running with `globals: true` (it relies on a global `afterEach`). We keep
 * globals off to avoid polluting the type space, so register the cleanup
 * explicitly here once.
 */
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
	cleanup();
});
