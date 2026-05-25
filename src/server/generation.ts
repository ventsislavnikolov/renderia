import { createServerFn } from "@tanstack/react-start";
import { getRenovationAiProvider } from "../lib/ai/provider";
import type { RenovationAiProvider } from "../lib/ai/types";
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
 */

export async function __detectProtectedElementsHandler(args: {
	provider: RenovationAiProvider;
	input: DetectProtectedElementsInput;
}) {
	return args.provider.detectProtectedElements(args.input);
}

export async function __createDesignBriefHandler(args: {
	provider: RenovationAiProvider;
	input: CreateDesignBriefInput;
}) {
	return args.provider.createDesignBrief(args.input);
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
