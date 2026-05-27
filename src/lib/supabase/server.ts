import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "../env";
import type { Database } from "../types/database";

/**
 * Build a request-scoped Supabase client that runs as the end user.
 *
 * Uses the *publishable* (anon) key — the same key the browser uses — so that
 * PostgREST treats the connection as an anonymous client, then upgrades it
 * via the user's bearer token in `Authorization`. That is the contract that
 * makes RLS evaluate `auth.uid()` correctly. Using the secret/service-role
 * key here would silently bypass RLS regardless of the header.
 */
export function createSupabaseUserClient(
	accessToken: string
): SupabaseClient<Database> {
	return createClient<Database>(
		requireEnv(process.env, "SUPABASE_URL"),
		requireEnv(process.env, "SUPABASE_PUBLISHABLE_KEY"),
		{
			global: { headers: { Authorization: `Bearer ${accessToken}` } },
			auth: { persistSession: false },
		}
	);
}

/**
 * Build an admin Supabase client that bypasses RLS.
 *
 * Intended for narrowly-scoped server-only tasks (e.g. background jobs,
 * webhook handlers that must read across users). No callers today — kept
 * minimal so we don't reach for the secret key by accident from a user
 * request path. If you call this, document why RLS is the wrong fit.
 */
export function createSupabaseAdminClient(): SupabaseClient<Database> {
	return createClient<Database>(
		requireEnv(process.env, "SUPABASE_URL"),
		requireEnv(process.env, "SUPABASE_SECRET_KEY"),
		{
			auth: { persistSession: false },
		}
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
 * The returned client is bound to the user's JWT and therefore evaluates RLS
 * as that user. We additionally call `auth.getUser(token)` here so the JWT
 * signature is verified through Supabase's auth server (the only OpenSSL
 * path on the request), guaranteeing the `userId` we return cannot be
 * forged by a caller who guesses the token shape.
 *
 * Handlers should still apply `owner_id` filters on queries for
 * defense-in-depth — RLS plus an explicit filter are two independent
 * layers of ownership enforcement.
 */
export async function requireAuthedSupabase(
	accessToken: string | null | undefined
): Promise<{ userId: string; supabase: SupabaseClient<Database> }> {
	if (!accessToken) {
		throw new Error("Authentication required");
	}
	const supabase = createSupabaseUserClient(accessToken);
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
	authorization: string | undefined | null
): string | undefined {
	if (!authorization) return;
	const match = authorization.match(/^Bearer\s+(.+)$/i);
	return match ? match[1]?.trim() : undefined;
}

/**
 * Normalise a Supabase/PostgREST error into a user-safe `Error`.
 *
 * Raw `error.message` from PostgREST can leak schema details, RLS policy
 * names, or constraint internals. We map the few codes the app actually
 * cares about and collapse everything else to a generic "Database error".
 * Callers should `throw wrapSupabaseError(error)` instead of throwing the
 * raw message.
 */
export function wrapSupabaseError(error: {
	code?: string;
	message: string;
}): Error {
	if (error.code === "42501") return new Error("Not authorized");
	if (error.code === "PGRST116") return new Error("Not found");
	return new Error("Database error");
}
