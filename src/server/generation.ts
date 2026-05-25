import { createServerFn } from "@tanstack/react-start";
import { getRenovationAiProvider } from "../lib/ai/provider";
import type { ProviderDebug, RenovationAiProvider } from "../lib/ai/types";
import {
	type CreateDesignBriefInput,
	createDesignBriefSchema,
	type DetectProtectedElementsInput,
	detectProtectedElementsSchema,
} from "../lib/renovation/schema";

/**
 * Server functions for detection and brief generation.
 *
 * These two operations do not currently persist anything to the database —
 * they are stateless provider calls used by the guided workspace before the
 * user confirms a protected-element set or saves a brief. Persistence
 * server functions (`saveProtectedElements`, `saveDesignBrief`,
 * `enqueueGenerationJob`) will land in a follow-up task once the UI knows
 * which shapes to send back. Keeping these handlers pure makes that
 * follow-up wiring trivial.
 *
 * The handlers return `{ data, debug? }`. `debug` is the provider's debug
 * payload (model id, assembled prompt, raw response, duration) and is only
 * forwarded outside the server in non-production builds — see
 * `attachDebugIfDev` below. Returning the same shape in dev and prod keeps
 * the client types stable; `debug` is just always `undefined` in prod.
 */

/**
 * Strip the debug payload in production so prompts and raw model responses
 * never leak to end users. Tests stub `process.env.NODE_ENV` directly when
 * they need to exercise both paths.
 */
function attachDebugIfDev<T>(value: T, debug: ProviderDebug | undefined) {
	if (process.env.NODE_ENV === "production") return { data: value };
	return debug === undefined ? { data: value } : { data: value, debug };
}

/** @internal */
export async function __detectProtectedElementsHandler(args: {
	provider: RenovationAiProvider;
	input: DetectProtectedElementsInput;
}) {
	const result = await args.provider.detectProtectedElements(args.input);
	return attachDebugIfDev(result.value, result.debug);
}

/** @internal */
export async function __createDesignBriefHandler(args: {
	provider: RenovationAiProvider;
	input: CreateDesignBriefInput;
}) {
	const result = await args.provider.createDesignBrief(args.input);
	return attachDebugIfDev(result.value, result.debug);
}

export const detectProtectedElements = createServerFn({ method: "POST" })
	.inputValidator(detectProtectedElementsSchema)
	.handler(async ({ data }) => {
		return __detectProtectedElementsHandler({
			provider: getRenovationAiProvider(),
			input: data,
		});
	});

export const createDesignBrief = createServerFn({ method: "POST" })
	.inputValidator(createDesignBriefSchema)
	.handler(async ({ data }) => {
		return __createDesignBriefHandler({
			provider: getRenovationAiProvider(),
			input: data,
		});
	});
