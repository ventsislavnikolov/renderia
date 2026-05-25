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
		if (!session) {
			throw redirect({ to: "/auth" });
		}
	},
	component: Home,
});

function Home() {
	return (
		<div className="p-8">
			<h1 className="text-4xl font-bold">Renderia</h1>
			<p className="mt-4 text-lg">
				Workspace is being prepared. Project list arrives in the next task.
			</p>
		</div>
	);
}
