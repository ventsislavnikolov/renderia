import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { AppShell } from "../components/layout/app-shell";
import { supabaseBrowser } from "../lib/supabase/browser";

/**
 * `/projects/:projectId/tasks/:taskId` — guided task workspace shell.
 *
 * Task 7 stands up this route as a navigation target with breadcrumbs and a
 * placeholder body. Task 8 replaces the placeholder with the guided flow
 * (`GuidedFlow` component) without touching the shell wiring.
 */
export const Route = createFileRoute("/projects/$projectId/tasks/$taskId")({
	ssr: false,
	beforeLoad: async () => {
		const {
			data: { session },
		} = await supabaseBrowser.auth.getSession();
		if (!session) {
			throw redirect({ to: "/auth" });
		}
	},
	component: TaskWorkspaceRoute,
});

function TaskWorkspaceRoute() {
	const { projectId, taskId } = Route.useParams();

	const breadcrumbs = (
		<>
			<Link to="/projects">Projects</Link>
			<span aria-hidden="true"> / </span>
			<Link to="/projects/$projectId" params={{ projectId }}>
				Project
			</Link>
			<span aria-hidden="true"> / </span>
			<span aria-current="page">Task</span>
		</>
	);

	return (
		<AppShell breadcrumbs={breadcrumbs}>
			<section className="workspace-section">
				<header className="workspace-section-header">
					<h1>Renovation task workspace</h1>
					<p>
						The guided renovation flow — photo selection, protected-element
						confirmation, brief, and image generation — is added in the next
						task.
					</p>
				</header>
				<dl className="workspace-meta">
					<div>
						<dt>Project ID</dt>
						<dd>
							<code>{projectId}</code>
						</dd>
					</div>
					<div>
						<dt>Task ID</dt>
						<dd>
							<code>{taskId}</code>
						</dd>
					</div>
				</dl>
			</section>
		</AppShell>
	);
}
