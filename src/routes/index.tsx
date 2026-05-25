import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabaseBrowser } from "../lib/supabase/browser";

// SSR is disabled for this route so the auth guard runs only in the browser
// where the Supabase session is available. With SSR enabled, the previous
// `typeof window === "undefined"` short-circuit would render the protected
// HTML on the server before the redirect could fire.
export const Route = createFileRoute("/")({
	ssr: false,
	beforeLoad: async () => {
		const {
			data: { session },
		} = await supabaseBrowser.auth.getSession();
		throw redirect({ to: session ? "/projects" : "/auth" });
	},
});
