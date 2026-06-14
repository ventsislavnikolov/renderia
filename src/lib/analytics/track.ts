import { track as vercelTrack } from "@vercel/analytics";
import type { ConsentChoice } from "./consent";

/**
 * Consent-gated analytics for the core funnel.
 *
 * Six events, no more — instrumented at their success points across the app.
 * Props carry ids/counts only (no names, URLs, or emails) so nothing
 * personally identifying ever leaves the client.
 */
export type FunnelEvent =
	| "project_created"
	| "photo_uploaded"
	| "brief_generated"
	| "variations_generated"
	| "favorite_marked"
	| "furniture_imported";

/** Vercel only allows primitive prop values; ids/counts/flags fit fine. */
export type EventProps = Record<string, string | number | boolean | null>;

// Module-level mirror of the user's consent, kept in sync by the provider via
// `setAnalyticsConsent`. Default `undecided` means `track()` is a no-op until
// the user explicitly opts in — no analytics call fires before consent.
let consentState: ConsentChoice = "undecided";

/** Point the consent gate at the latest choice (called by the provider). */
export function setAnalyticsConsent(choice: ConsentChoice): void {
	consentState = choice;
}

/** Current gate state — exposed for tests and diagnostics. */
export function getAnalyticsConsent(): ConsentChoice {
	return consentState;
}

/**
 * Fire a funnel event — but only once the user has accepted. Pre-consent (and
 * on decline) this is a no-op and no network request is made.
 */
export function track(name: FunnelEvent, props?: EventProps): void {
	if (consentState !== "accepted") {
		return;
	}
	vercelTrack(name, props);
}
