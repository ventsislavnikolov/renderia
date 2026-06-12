import { createFileRoute } from "@tanstack/react-router";
import { FavoritesList } from "../components/favorites/favorites-list";

export const Route = createFileRoute("/_app/favorites")({
	ssr: false,
	component: FavoritesRoute,
});

function FavoritesRoute() {
	return <FavoritesList />;
}
