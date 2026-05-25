import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "../env";
import type { Database } from "../types/database";

export function createSupabaseServerClient(accessToken?: string) {
	return createClient<Database>(
		requireEnv(process.env, "SUPABASE_URL"),
		requireEnv(process.env, "SUPABASE_SECRET_KEY"),
		{
			global: accessToken
				? { headers: { Authorization: `Bearer ${accessToken}` } }
				: undefined,
			auth: { persistSession: false },
		},
	);
}

export function requireUserId(userId: string | null | undefined) {
	if (!userId) {
		throw new Error("Authentication required");
	}
	return userId;
}

/**
 * Resolve the authenticated user id and a request-scoped Supabase client.
 *
 * Server functions live behind the user's bearer token: we forward it to
 * Supabase so that PostgREST evaluates RLS as that user instead of as the
 * service role. Callers should rely on the returned `userId` for
 * defense-in-depth `owner_id` filters as well — RLS plus an explicit filter
 * gives two independent layers of ownership enforcement.
 *
 * `accessToken` is provided so tests (and adjacent server entry points) can
 * supply a pre-extracted token without coupling to the request transport.
 */
export async function requireAuthedSupabase(
	accessToken: string | null | undefined,
): Promise<{ userId: string; supabase: SupabaseClient<Database> }> {
	if (!accessToken) {
		throw new Error("Authentication required");
	}
	const supabase = createSupabaseServerClient(accessToken);
	const { data, error } = await supabase.auth.getUser(accessToken);
	if (error || !data.user) {
		throw new Error("Authentication required");
	}
	return { userId: data.user.id, supabase };
}

/**
 * Read the bearer token from an incoming Authorization header.
 * Accepts the `Bearer <token>` form only. Returns `undefined` for any other
 * shape so server functions can produce a uniform 401-shaped error.
 */
export function readBearerToken(
	authorization: string | undefined | null,
): string | undefined {
	if (!authorization) return undefined;
	const match = authorization.match(/^Bearer\s+(.+)$/i);
	return match ? match[1]?.trim() : undefined;
}
