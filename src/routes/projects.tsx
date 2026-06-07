import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "../components/layout/app-shell";
import { supabaseBrowser } from "../lib/supabase/browser";

export const Route = createFileRoute("/projects")({
	ssr: false,
	beforeLoad: async () => {
		const {
			data: { session },
		} = await supabaseBrowser.auth.getSession();
		if (!session) {
			throw redirect({ to: "/sign-in" });
		}
	},
	component: ProjectsLayout,
});

function ProjectsLayout() {
	return (
		<AppShell>
			<Outlet />
		</AppShell>
	);
}
