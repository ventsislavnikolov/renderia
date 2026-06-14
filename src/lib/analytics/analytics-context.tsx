import { Analytics } from "@vercel/analytics/react";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ConsentBanner } from "../../components/analytics/consent-banner";
import { type ConsentChoice, persistConsent, readConsent } from "./consent";
import { setAnalyticsConsent } from "./track";

interface AnalyticsConsentValue {
	accept: () => void;
	consent: ConsentChoice;
	decline: () => void;
}

const AnalyticsConsentContext = createContext<AnalyticsConsentValue | null>(
	null
);

/**
 * Owns analytics consent for the whole app.
 *
 * Explicit opt-in: state starts `undecided` (matching SSR) and the persisted
 * choice is read on mount, so there's no hydration mismatch and no flash of a
 * banner for users who already chose. `<Analytics />` mounts — and so the only
 * network call happens — solely when consent is `accepted`. The consent gate in
 * `track.ts` is kept in sync here so `track()` calls elsewhere stay no-ops until
 * acceptance.
 */
export function AnalyticsProvider({ children }: { children: ReactNode }) {
	const [consent, setConsent] = useState<ConsentChoice>("undecided");
	// Gate the banner on having read localStorage so returning users who already
	// declined never see it flash.
	const [hydrated, setHydrated] = useState(false);

	useEffect(() => {
		const stored = readConsent();
		setConsent(stored);
		setAnalyticsConsent(stored);
		setHydrated(true);
	}, []);

	const value = useMemo<AnalyticsConsentValue>(() => {
		function choose(choice: ConsentChoice) {
			setConsent(choice);
			setAnalyticsConsent(choice);
			persistConsent(choice);
		}
		return {
			consent,
			accept: () => choose("accepted"),
			decline: () => choose("declined"),
		};
	}, [consent]);

	return (
		<AnalyticsConsentContext.Provider value={value}>
			{children}
			{hydrated && consent === "undecided" ? (
				<ConsentBanner onAccept={value.accept} onDecline={value.decline} />
			) : null}
			{consent === "accepted" ? <Analytics /> : null}
		</AnalyticsConsentContext.Provider>
	);
}

/** Read the current consent choice and the accept/decline actions. */
export function useAnalyticsConsent(): AnalyticsConsentValue {
	const value = useContext(AnalyticsConsentContext);
	if (!value) {
		throw new Error(
			"useAnalyticsConsent must be used within an AnalyticsProvider"
		);
	}
	return value;
}
