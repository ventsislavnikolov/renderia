import * as Sentry from "@sentry/tanstackstart-react";

import {
	resolveSentryConfig,
	type SentryConfig,
	scrubSentryEvent,
} from "./sentry-config";

let initialized = false;

/**
 * Initialise the browser Sentry client once, on the client only.
 *
 * No-op when no DSN is configured (local/dev) so nothing is sent and no
 * network call is made. Safe to call multiple times — only the first call
 * with a resolved config initialises the SDK.
 */
export function initSentryClient(): void {
	if (initialized || typeof document === "undefined") {
		return;
	}
	const config = resolveSentryConfig(
		import.meta.env as Record<string, string | undefined>
	);
	if (!config) {
		return;
	}
	initialized = true;
	Sentry.init(toInitOptions(config));
}

function toInitOptions(config: SentryConfig) {
	return {
		dsn: config.dsn,
		environment: config.environment,
		release: config.release,
		tracesSampleRate: config.tracesSampleRate,
		// Never attach IPs, cookies, or request bodies automatically.
		sendDefaultPii: false,
		beforeSend: scrubSentryEvent,
	};
}
