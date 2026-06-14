import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

// The real <Analytics /> injects a script and would make a network call — stub
// it so the test only exercises the consent gate, not Vercel's runtime.
vi.mock("@vercel/analytics/react", () => ({
	Analytics: () => null,
}));

import { AnalyticsProvider } from "./analytics-context";
import { CONSENT_STORAGE_KEY } from "./consent";
import { getAnalyticsConsent, setAnalyticsConsent } from "./track";

afterEach(() => {
	window.localStorage.clear();
	setAnalyticsConsent("undecided");
});

describe("AnalyticsProvider consent gate", () => {
	it("shows the banner for an undecided user and keeps tracking off", async () => {
		render(
			<AnalyticsProvider>
				<div>app</div>
			</AnalyticsProvider>
		);

		expect(await screen.findByRole("button", { name: "Accept" })).toBeVisible();
		expect(getAnalyticsConsent()).toBe("undecided");
	});

	it("persists acceptance, opens the gate, and dismisses the banner", async () => {
		const user = userEvent.setup();
		render(
			<AnalyticsProvider>
				<div>app</div>
			</AnalyticsProvider>
		);

		await user.click(await screen.findByRole("button", { name: "Accept" }));

		expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).toBe("accepted");
		expect(getAnalyticsConsent()).toBe("accepted");
		expect(
			screen.queryByRole("button", { name: "Accept" })
		).not.toBeInTheDocument();
	});

	it("persists a decline and keeps the gate closed", async () => {
		const user = userEvent.setup();
		render(
			<AnalyticsProvider>
				<div>app</div>
			</AnalyticsProvider>
		);

		await user.click(await screen.findByRole("button", { name: "Decline" }));

		expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).toBe("declined");
		expect(getAnalyticsConsent()).toBe("declined");
		expect(
			screen.queryByRole("button", { name: "Decline" })
		).not.toBeInTheDocument();
	});

	it("does not show the banner when a choice was already persisted", async () => {
		window.localStorage.setItem(CONSENT_STORAGE_KEY, "declined");
		render(
			<AnalyticsProvider>
				<div>app</div>
			</AnalyticsProvider>
		);

		await waitFor(() => expect(getAnalyticsConsent()).toBe("declined"));
		expect(
			screen.queryByRole("button", { name: "Accept" })
		).not.toBeInTheDocument();
	});
});
