import * as Sentry from "@sentry/tanstackstart-react";

import { resolveSentryConfig, scrubSentryEvent } from "./sentry-config";

let initialized = false;

function serverEnv(): Record<string, string | undefined> {
	return typeof process === "undefined" ? {} : process.env;
}

/**
 * Initialise the server Sentry client once.
 *
 * No-op when no DSN is configured so local runs and unconfigured environments
 * stay silent. Called from the Start entry (`src/start.ts`) so it runs before
 * any server function executes.
 */
export function initSentryServer(): void {
	if (initialized) {
		return;
	}
	const config = resolveSentryConfig(serverEnv());
	if (!config) {
		return;
	}
	initialized = true;
	Sentry.init({
		dsn: config.dsn,
		environment: config.environment,
		release: config.release,
		tracesSampleRate: config.tracesSampleRate,
		sendDefaultPii: false,
		beforeSend: scrubSentryEvent,
	});
}
