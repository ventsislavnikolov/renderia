/**
 * Analytics consent: a tiny, framework-free persistence layer.
 *
 * Posture is explicit opt-in — the default is `undecided` and **nothing is
 * tracked until the user accepts** (see `track.ts`). The choice is persisted to
 * localStorage so it survives reloads; `decline` keeps analytics off
 * permanently until the user changes their mind.
 */

export type ConsentChoice = "accepted" | "declined" | "undecided";

/** localStorage key holding the persisted consent choice. */
export const CONSENT_STORAGE_KEY = "renderia.analytics-consent";

function isConsentChoice(value: string | null): value is ConsentChoice {
	return value === "accepted" || value === "declined" || value === "undecided";
}

/**
 * Read the persisted consent choice. Returns `undecided` when nothing is
 * stored, when the stored value is unrecognised, or when there is no
 * localStorage available (SSR / privacy mode) — never throws.
 */
export function readConsent(): ConsentChoice {
	if (typeof window === "undefined") {
		return "undecided";
	}
	try {
		const stored = window.localStorage.getItem(CONSENT_STORAGE_KEY);
		return isConsentChoice(stored) ? stored : "undecided";
	} catch {
		return "undecided";
	}
}

/**
 * Persist the consent choice. Best-effort — a failing localStorage (quota,
 * privacy mode) never throws into the caller.
 */
export function persistConsent(choice: ConsentChoice): void {
	if (typeof window === "undefined") {
		return;
	}
	try {
		window.localStorage.setItem(CONSENT_STORAGE_KEY, choice);
	} catch {
		// Best-effort persistence; ignore storage failures.
	}
}
