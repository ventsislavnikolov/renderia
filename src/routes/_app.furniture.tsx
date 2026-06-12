import { createFileRoute } from "@tanstack/react-router";
import { FurnitureLibrary } from "../components/furniture/furniture-library";

export const Route = createFileRoute("/_app/furniture")({
	ssr: false,
	component: FurnitureRoute,
});

function FurnitureRoute() {
	return <FurnitureLibrary />;
}
