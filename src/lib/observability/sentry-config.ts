/**
 * Pure, environment-agnostic Sentry configuration.
 *
 * Kept free of any `@sentry/*` import so it can run identically on the client
 * (`import.meta.env`) and the server (`process.env`), and so the guard and
 * scrubbing logic are unit-testable without the SDK. The `init` modules pass
 * the right env source in and feed the result to `Sentry.init`.
 */

/** Default fraction of transactions sampled for performance tracing. */
export const DEFAULT_TRACES_SAMPLE_RATE = 0.1;

export type SentryConfig = {
	dsn: string;
	environment: string;
	release: string | undefined;
	tracesSampleRate: number;
};

type EnvSource = Record<string, string | undefined>;

/** First non-empty value across the given keys, trimmed. */
function firstValue(
	source: EnvSource,
	keys: readonly string[]
): string | undefined {
	for (const key of keys) {
		const value = source[key]?.trim();
		if (value) {
			return value;
		}
	}
	return;
}

const DSN_KEYS = ["SENTRY_DSN", "VITE_SENTRY_DSN"] as const;
const RELEASE_KEYS = [
	"SENTRY_RELEASE",
	"VITE_SENTRY_RELEASE",
	"VERCEL_GIT_COMMIT_SHA",
] as const;
const ENVIRONMENT_KEYS = [
	"SENTRY_ENVIRONMENT",
	"VITE_SENTRY_ENVIRONMENT",
	"VERCEL_ENV",
] as const;
const SAMPLE_RATE_KEYS = [
	"SENTRY_TRACES_SAMPLE_RATE",
	"VITE_SENTRY_TRACES_SAMPLE_RATE",
] as const;

function parseSampleRate(raw: string | undefined): number {
	if (!raw) {
		return DEFAULT_TRACES_SAMPLE_RATE;
	}
	const parsed = Number(raw);
	if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
		return DEFAULT_TRACES_SAMPLE_RATE;
	}
	return parsed;
}

/**
 * Resolve the Sentry config from an env source, or `null` when no DSN is set.
 *
 * Returning `null` is the disabled path: callers must treat it as a clean
 * no-op (no SDK init, no network) so local and unconfigured environments are
 * unaffected.
 */
export function resolveSentryConfig(source: EnvSource): SentryConfig | null {
	const dsn = firstValue(source, DSN_KEYS);
	if (!dsn) {
		return null;
	}
	return {
		dsn,
		environment: firstValue(source, ENVIRONMENT_KEYS) ?? "development",
		release: firstValue(source, RELEASE_KEYS),
		tracesSampleRate: parseSampleRate(firstValue(source, SAMPLE_RATE_KEYS)),
	};
}

/** Header names that may carry credentials and must never reach Sentry. */
const SENSITIVE_HEADER_KEYS = new Set([
	"authorization",
	"proxy-authorization",
	"cookie",
	"set-cookie",
	"x-api-key",
	"apikey",
]);

type ScrubbableEvent = {
	user?: unknown;
	request?: {
		headers?: Record<string, unknown>;
		cookies?: unknown;
	};
};

/**
 * `beforeSend` hook: strip PII and auth tokens before an event leaves the
 * process. Drops the user object entirely and removes credential-bearing
 * request headers and cookies. Combined with `sendDefaultPii: false` this
 * keeps emails, IPs, and bearer tokens out of captured events.
 *
 * Generic and unconstrained so it slots directly into Sentry's `beforeSend`
 * (where the event is an `ErrorEvent`) while staying convenient to unit test
 * with plain object literals.
 */
export function scrubSentryEvent<T>(event: T): T {
	if (!event || typeof event !== "object") {
		return event;
	}
	const target = event as ScrubbableEvent;
	if ("user" in target) {
		target.user = undefined;
	}
	const request = target.request;
	if (request && typeof request === "object") {
		if ("cookies" in request) {
			request.cookies = undefined;
		}
		const headers = request.headers;
		if (headers && typeof headers === "object") {
			for (const key of Object.keys(headers)) {
				if (SENSITIVE_HEADER_KEYS.has(key.toLowerCase())) {
					delete headers[key];
				}
			}
		}
	}
	return event;
}
