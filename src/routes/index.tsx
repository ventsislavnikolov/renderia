import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabaseBrowser } from "../lib/supabase/browser";

export const Route = createFileRoute("/")({
	beforeLoad: async () => {
		if (typeof window === "undefined") return;
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
