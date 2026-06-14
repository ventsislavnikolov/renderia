import { afterEach, describe, expect, it } from "vitest";
import { CONSENT_STORAGE_KEY, persistConsent, readConsent } from "./consent";

afterEach(() => {
	window.localStorage.clear();
});

describe("analytics consent persistence", () => {
	it("defaults to undecided when nothing is stored", () => {
		expect(readConsent()).toBe("undecided");
	});

	it("round-trips a persisted choice across reads", () => {
		persistConsent("accepted");
		expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).toBe("accepted");
		expect(readConsent()).toBe("accepted");

		persistConsent("declined");
		expect(readConsent()).toBe("declined");
	});

	it("treats an unrecognised stored value as undecided", () => {
		window.localStorage.setItem(CONSENT_STORAGE_KEY, "garbage");
		expect(readConsent()).toBe("undecided");
	});
});
