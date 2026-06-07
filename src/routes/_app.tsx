import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "../components/layout/app-shell";
import { supabaseBrowser } from "../lib/supabase/browser";

/**
 * Pathless layout for every authenticated screen.
 *
 * Owns the single `AppShell` instance (sidebar + workspace data) so it mounts
 * once and survives navigation between `/` and `/projects/*`. Without this the
 * sidebar remounted on each route change and re-fetched projects + tasks,
 * flashing skeletons every time. The auth guard lives here too, replacing the
 * per-route guards the child routes used to duplicate.
 */
export const Route = createFileRoute("/_app")({
	ssr: false,
	beforeLoad: async () => {
		const {
			data: { session },
		} = await supabaseBrowser.auth.getSession();
		if (!session) {
			throw redirect({ to: "/sign-in" });
		}
	},
	component: AppLayout,
});

function AppLayout() {
	return (
		<AppShell>
			<Outlet />
		</AppShell>
	);
}
