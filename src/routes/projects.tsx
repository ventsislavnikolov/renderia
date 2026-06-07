import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "../components/layout/app-shell";
import { supabaseBrowser } from "../lib/supabase/browser";
import { WorkspaceProvider } from "../lib/workspace-context";

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
		<WorkspaceProvider>
			<AppShell>
				<Outlet />
			</AppShell>
		</WorkspaceProvider>
	);
}
