import { describe, expect, it } from "vitest";

import {
	DEFAULT_TRACES_SAMPLE_RATE,
	resolveSentryConfig,
	scrubSentryEvent,
} from "../../../../src/lib/observability/sentry-config";

describe("resolveSentryConfig", () => {
	it("returns null when no DSN is set so Sentry stays disabled", () => {
		expect(resolveSentryConfig({})).toBeNull();
		expect(resolveSentryConfig({ SENTRY_DSN: "" })).toBeNull();
		expect(resolveSentryConfig({ SENTRY_DSN: "   " })).toBeNull();
	});

	it("reads the DSN from the server key", () => {
		const config = resolveSentryConfig({ SENTRY_DSN: "https://k@o.sentry/1" });
		expect(config?.dsn).toBe("https://k@o.sentry/1");
	});

	it("reads the DSN from the client (VITE_) key", () => {
		const config = resolveSentryConfig({
			VITE_SENTRY_DSN: "https://k@o.sentry/2",
		});
		expect(config?.dsn).toBe("https://k@o.sentry/2");
	});

	it("prefers the unprefixed server DSN over the VITE_ one", () => {
		const config = resolveSentryConfig({
			SENTRY_DSN: "https://server@o.sentry/1",
			VITE_SENTRY_DSN: "https://client@o.sentry/2",
		});
		expect(config?.dsn).toBe("https://server@o.sentry/1");
	});

	it("resolves the release from explicit env, then the Vercel commit sha", () => {
		expect(
			resolveSentryConfig({
				SENTRY_DSN: "https://k@o/1",
				SENTRY_RELEASE: "renderia@1.10.3",
			})?.release
		).toBe("renderia@1.10.3");
		expect(
			resolveSentryConfig({
				SENTRY_DSN: "https://k@o/1",
				VERCEL_GIT_COMMIT_SHA: "abc1234",
			})?.release
		).toBe("abc1234");
		expect(
			resolveSentryConfig({ SENTRY_DSN: "https://k@o/1" })?.release
		).toBeUndefined();
	});

	it("resolves the environment, defaulting to development", () => {
		expect(
			resolveSentryConfig({
				SENTRY_DSN: "https://k@o/1",
				VERCEL_ENV: "production",
			})?.environment
		).toBe("production");
		expect(
			resolveSentryConfig({
				SENTRY_DSN: "https://k@o/1",
				SENTRY_ENVIRONMENT: "staging",
				VERCEL_ENV: "preview",
			})?.environment
		).toBe("staging");
		expect(
			resolveSentryConfig({ SENTRY_DSN: "https://k@o/1" })?.environment
		).toBe("development");
	});

	it("parses the traces sample rate and falls back to the default", () => {
		expect(
			resolveSentryConfig({
				SENTRY_DSN: "https://k@o/1",
				SENTRY_TRACES_SAMPLE_RATE: "0.25",
			})?.tracesSampleRate
		).toBe(0.25);
		expect(
			resolveSentryConfig({ SENTRY_DSN: "https://k@o/1" })?.tracesSampleRate
		).toBe(DEFAULT_TRACES_SAMPLE_RATE);
		// Out-of-range / non-numeric values fall back rather than crash.
		expect(
			resolveSentryConfig({
				SENTRY_DSN: "https://k@o/1",
				SENTRY_TRACES_SAMPLE_RATE: "nope",
			})?.tracesSampleRate
		).toBe(DEFAULT_TRACES_SAMPLE_RATE);
		expect(
			resolveSentryConfig({
				SENTRY_DSN: "https://k@o/1",
				SENTRY_TRACES_SAMPLE_RATE: "5",
			})?.tracesSampleRate
		).toBe(DEFAULT_TRACES_SAMPLE_RATE);
	});
});

describe("scrubSentryEvent", () => {
	it("drops the user object so no PII reaches Sentry", () => {
		const event = {
			user: { id: "u1", email: "person@example.com", ip_address: "1.2.3.4" },
			message: "boom",
		};
		const scrubbed = scrubSentryEvent(event);
		expect(scrubbed.user).toBeUndefined();
		expect(scrubbed.message).toBe("boom");
	});

	it("removes auth tokens from request headers and cookies", () => {
		const event = {
			request: {
				headers: {
					Authorization: "Bearer secret-token",
					cookie: "sb-access-token=xyz",
					apikey: "publishable-key",
					"Content-Type": "application/json",
				},
				cookies: { "sb-access-token": "xyz" },
			},
		};
		const scrubbed = scrubSentryEvent(event);
		expect(scrubbed.request?.headers).not.toHaveProperty("Authorization");
		expect(scrubbed.request?.headers).not.toHaveProperty("cookie");
		expect(scrubbed.request?.headers).not.toHaveProperty("apikey");
		expect(scrubbed.request?.headers).toHaveProperty("Content-Type");
		expect(scrubbed.request?.cookies).toBeUndefined();
	});

	it("is a no-op for events without user or request data", () => {
		const event = { message: "no pii here" };
		expect(scrubSentryEvent(event)).toEqual({ message: "no pii here" });
	});
});
