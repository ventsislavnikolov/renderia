import { createFileRoute, redirect } from "@tanstack/react-router";
import { PromptEntry } from "../components/home/prompt-entry";
import { AppShell } from "../components/layout/app-shell";
import { supabaseBrowser } from "../lib/supabase/browser";

/**
 * `/` — chat-style entry point.
 *
 * SSR is disabled so the auth guard can read the Supabase session from the
 * browser (same rationale as `/projects`). Unauthenticated visitors are
 * bounced to `/sign-in`; the rest land on the centered "What should we build?"
 * prompt that creates a project + task and drops them straight into the
 * 4-step guided workspace.
 */
export const Route = createFileRoute("/")({
	ssr: false,
	beforeLoad: async () => {
		const {
			data: { session },
		} = await supabaseBrowser.auth.getSession();
		if (!session) {
			throw redirect({ to: "/sign-in" });
		}
	},
	component: HomeRoute,
});

function HomeRoute() {
	return (
		<AppShell>
			<PromptEntry />
		</AppShell>
	);
}
