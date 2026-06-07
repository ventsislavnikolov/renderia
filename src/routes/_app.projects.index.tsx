import { createFileRoute } from "@tanstack/react-router";
import { ProjectList } from "../components/projects/project-list";

export const Route = createFileRoute("/_app/projects/")({
	ssr: false,
	component: ProjectsRoute,
});

function ProjectsRoute() {
	return <ProjectList />;
}
