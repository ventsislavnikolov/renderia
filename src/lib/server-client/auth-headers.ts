import { supabaseBrowser } from "../supabase/browser";

/**
 * Sentinel `Error.message` thrown by `getAuthHeaders` when the browser has no
 * Supabase session. Callers compare against this constant to decide whether
 * to redirect to `/auth` instead of showing a generic error toast.
 */
export const UNAUTHENTICATED_ERROR = "UNAUTHENTICATED";

/**
 * Build the `Authorization: Bearer <jwt>` header pair for a server-fn call.
 *
 * Server functions read the bearer token via `getRequestHeader("authorization")`
 * and use it to scope the request-bound Supabase client to the calling user
 * (see `src/lib/supabase/server.ts`). The browser must therefore attach the
 * current session's access token to every server-fn call.
 *
 * Throws `Error(UNAUTHENTICATED_ERROR)` when no session is present so callers
 * can branch on it (catch → `window.location.assign("/auth")`). We use a
 * window navigation instead of TanStack Router's `redirect()` so the helper
 * works from any context (components, hooks, plain async functions) without
 * needing access to the router instance.
 */
export async function getAuthHeaders(): Promise<{ Authorization: string }> {
	const {
		data: { session },
	} = await supabaseBrowser.auth.getSession();
	const token = session?.access_token;
	if (!token) throw new Error(UNAUTHENTICATED_ERROR);
	return { Authorization: `Bearer ${token}` };
}
