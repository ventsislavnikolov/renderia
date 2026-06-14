import {
	sentryGlobalFunctionMiddleware,
	sentryGlobalRequestMiddleware,
} from "@sentry/tanstackstart-react";
import { createIsomorphicFn, createStart } from "@tanstack/react-start";

// Initialise the server SDK before any request or server function runs. Wrapped
// in an isomorphic fn so the server-only module never enters the client graph;
// the body is a no-op on the client and a no-op server-side without a DSN.
const initSentry = createIsomorphicFn().server(() => {
	import("./lib/observability/sentry.server").then((module) => {
		module.initSentryServer();
	});
});

initSentry();

/**
 * Global Start configuration. The Sentry middlewares wrap every request and
 * server-function call so unhandled errors are captured and performance spans
 * are recorded without per-handler wiring.
 */
export const startInstance = createStart(() => ({
	requestMiddleware: [sentryGlobalRequestMiddleware],
	functionMiddleware: [sentryGlobalFunctionMiddleware],
}));
