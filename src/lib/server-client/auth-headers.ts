import { supabaseBrowser } from "../supabase/browser";

/**
 * Build the `Authorization: Bearer <jwt>` header pair for a server-fn call.
 *
 * Server functions read the bearer token via `getRequestHeader("authorization")`
 * and use it to scope the request-bound Supabase client to the calling user
 * (see `src/lib/supabase/server.ts`). The browser must therefore attach the
 * current session's access token to every server-fn call.
 *
 * Returns `undefined` when the user has no session — server fns will then
 * reject with `"Authentication required"`, which the caller can translate
 * into a redirect to `/auth`.
 */
export async function getAuthHeaders(): Promise<
	{ Authorization: string } | undefined
> {
	const {
		data: { session },
	} = await supabaseBrowser.auth.getSession();
	const token = session?.access_token;
	if (!token) return undefined;
	return { Authorization: `Bearer ${token}` };
}
