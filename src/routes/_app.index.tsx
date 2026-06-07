import { createFileRoute } from "@tanstack/react-router";
import { PromptEntry } from "../components/home/prompt-entry";

/**
 * `/` — chat-style entry point.
 *
 * Auth + the workspace shell live in the `_app` pathless layout, so this route
 * only renders the centered "What should we build?" prompt that creates a
 * project + task and drops them straight into the 4-step guided workspace.
 */
export const Route = createFileRoute("/_app/")({
	ssr: false,
	component: HomeRoute,
});

function HomeRoute() {
	return <PromptEntry />;
}
