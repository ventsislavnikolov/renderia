import { expect, test } from "@playwright/test";
import {
	installBaseMocks,
	installFakeSession,
	PROJECT_ID,
	TASK_ID,
} from "./support";

/**
 * End-to-end coverage for the Favorites page (`/favorites`).
 *
 * Marking a variation as a favorite happens in the guided workspace (covered
 * by `guided-workspace.spec.ts`); here we exercise the favorites *page*: a
 * favorited image renders with its project label, and unfavoriting it removes
 * the card so the empty state takes over. Every Supabase + server-fn boundary
 * is mocked via the shared `support` helpers.
 */

const FAVORITE_IMAGE = {
	id: "fav-image-1",
	signedUrl: "/storage/v1/object/generated/fav-0.png?token=fake",
	variationIndex: 0,
	contents: ["oak dining table", "rattan pendant light"],
	createdAt: "2026-01-02T00:00:00Z",
	taskId: TASK_ID,
	taskTitle: "Demo Task",
	projectId: PROJECT_ID,
	projectName: "Demo Renovation",
};

test.describe("favorites page", () => {
	test("renders a favorited image with its project label and contents", async ({
		page,
		context,
	}) => {
		await installFakeSession(context);
		await installBaseMocks(page, {
			listFavoriteImages: () => ({ images: [FAVORITE_IMAGE] }),
		});

		await page.goto("/favorites");

		await expect(
			page.getByRole("heading", { name: "Favorites" })
		).toBeVisible();
		await expect(
			page.getByRole("link", { name: "Demo Renovation" })
		).toBeVisible();
		await expect(
			page.getByRole("img", { name: /Variation 1 — Demo Renovation/i })
		).toBeVisible();
		await expect(page.getByText(/oak dining table/i)).toBeVisible();
	});

	test("unfavoriting an image removes it and shows the empty state", async ({
		page,
		context,
	}) => {
		await installFakeSession(context);
		let favoriteRemoved = false;
		await installBaseMocks(page, {
			listFavoriteImages: () => ({ images: [FAVORITE_IMAGE] }),
			setImageFavorite: (_route, body) => {
				favoriteRemoved = body?.data?.isFavorite === false;
				return {
					id: FAVORITE_IMAGE.id,
					is_favorite: false,
					storage_path: "x/fav-0.png",
					variation_index: 0,
				};
			},
		});

		await page.goto("/favorites");

		const removeButton = page.getByRole("button", {
			name: /Remove Demo Renovation variation 1 from favorites/i,
		});
		await expect(removeButton).toBeVisible();
		await removeButton.click();

		await expect(page.getByText("No favorites yet")).toBeVisible();
		await expect(removeButton).toHaveCount(0);
		expect(favoriteRemoved).toBe(true);
	});

	test("shows the empty state when there are no favorites", async ({
		page,
		context,
	}) => {
		await installFakeSession(context);
		await installBaseMocks(page, {
			listFavoriteImages: () => ({ images: [] }),
		});

		await page.goto("/favorites");

		await expect(page.getByText("No favorites yet")).toBeVisible();
	});
});
