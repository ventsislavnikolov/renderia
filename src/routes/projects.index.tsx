import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "../components/layout/app-shell";
import { ProjectList } from "../components/projects/project-list";
import { supabaseBrowser } from "../lib/supabase/browser";

/**
 * `/projects` — entry point of the authenticated workspace.
 *
 * SSR is disabled because the auth guard depends on the browser-only
 * Supabase session (same rationale as `/`). Unauthenticated visitors are
 * redirected to `/auth`.
 */
export const Route = createFileRoute("/projects/")({
	ssr: false,
	beforeLoad: async () => {
		const {
			data: { session },
		} = await supabaseBrowser.auth.getSession();
		if (!session) {
			throw redirect({ to: "/auth" });
		}
	},
	component: ProjectsRoute,
});

function ProjectsRoute() {
	return (
		<AppShell>
			<ProjectList />
		</AppShell>
	);
}
