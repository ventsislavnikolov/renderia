import { afterEach, describe, expect, it, vi } from "vitest";

const vercelTrack = vi.fn();
vi.mock("@vercel/analytics", () => ({
	track: (...args: unknown[]) => vercelTrack(...args),
}));

import { setAnalyticsConsent, track } from "./track";

afterEach(() => {
	vercelTrack.mockClear();
	// Reset the module-level gate so each test starts pre-consent.
	setAnalyticsConsent("undecided");
});

describe("consent-gated track()", () => {
	it("is a no-op before consent (undecided)", () => {
		track("project_created");
		expect(vercelTrack).not.toHaveBeenCalled();
	});

	it("stays a no-op when the user declines", () => {
		setAnalyticsConsent("declined");
		track("photo_uploaded");
		expect(vercelTrack).not.toHaveBeenCalled();
	});

	it("forwards the event to Vercel once the user accepts", () => {
		setAnalyticsConsent("accepted");
		track("variations_generated", { count: 3 });
		expect(vercelTrack).toHaveBeenCalledTimes(1);
		expect(vercelTrack).toHaveBeenCalledWith("variations_generated", {
			count: 3,
		});
	});

	it("reverts to a no-op if consent is withdrawn", () => {
		setAnalyticsConsent("accepted");
		track("favorite_marked");
		setAnalyticsConsent("declined");
		track("favorite_marked");
		expect(vercelTrack).toHaveBeenCalledTimes(1);
	});
});
