import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "../lib/supabase/server";

const createDevLoginLinkSchema = z.object({
	email: z.email().max(320),
	redirectTo: z.url().max(2000),
});

type CreateDevLoginLinkInput = z.infer<typeof createDevLoginLinkSchema>;

function isLocalhostRedirect(url: string) {
	const parsed = new URL(url);
	return (
		(parsed.protocol === "http:" || parsed.protocol === "https:") &&
		["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)
	);
}

export async function __createDevLoginLinkHandler(
	input: CreateDevLoginLinkInput
) {
	if (process.env.NODE_ENV !== "development") {
		throw new Error("Dev login is only available in local development");
	}
	if (!isLocalhostRedirect(input.redirectTo)) {
		throw new Error("Dev login redirect must stay on localhost");
	}

	const supabase = createSupabaseAdminClient();
	const { data, error } = await supabase.auth.admin.generateLink({
		type: "magiclink",
		email: input.email,
		options: {
			redirectTo: input.redirectTo,
		},
	});

	if (error || !data.properties.action_link) {
		throw new Error(error?.message ?? "Failed to create dev login link");
	}

	return { actionLink: data.properties.action_link };
}

export const createDevLoginLink = createServerFn({ method: "POST" })
	.validator(createDevLoginLinkSchema)
	.handler(async ({ data }) => {
		const origin = getRequestHeader("origin");
		if (!origin || !isLocalhostRedirect(origin)) {
			throw new Error("Dev login is only available from localhost");
		}
		return __createDevLoginLinkHandler(data);
	});
