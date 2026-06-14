import { expect, test } from "@playwright/test";
import { FIXTURE_BYTES, installBaseMocks, installFakeSession } from "./support";

/**
 * End-to-end coverage for the Furniture Library page (`/furniture`): the
 * library renders existing items, the manual-add flow uploads a product image
 * and the new piece appears, and deleting an item removes it through the
 * confirm dialog. Link Import lives on the same page but has its own spec.
 */

type FurnitureItem = {
	id: string;
	label: string;
	source: "product" | "photo";
	originalName: string;
	signedUrl: string | null;
	selected: boolean;
	createdAt: string;
	sourceLink: string | null;
	brand: string | null;
	price: number | null;
	currency: string | null;
	widthCm: number | null;
	heightCm: number | null;
	depthCm: number | null;
};

function makeItem(overrides: Partial<FurnitureItem> = {}): FurnitureItem {
	return {
		id: "item-1",
		label: "Walnut sideboard",
		source: "product",
		originalName: "sideboard.png",
		signedUrl: "/storage/v1/object/furniture-references/item-1.png?token=fake",
		selected: false,
		createdAt: "2026-01-01T00:00:00Z",
		sourceLink: null,
		brand: null,
		price: null,
		currency: null,
		widthCm: null,
		heightCm: null,
		depthCm: null,
		...overrides,
	};
}

test.describe("furniture library page", () => {
	test("renders existing furniture items", async ({ page, context }) => {
		await installFakeSession(context);
		await installBaseMocks(page, {
			listFurnitureItems: () => ({
				items: [makeItem(), makeItem({ id: "item-2", label: "Reading lamp" })],
			}),
		});

		await page.goto("/furniture");

		await expect(
			page.getByRole("heading", { level: 1, name: "Furniture" })
		).toBeVisible();
		await expect(page.getByText("Walnut sideboard")).toBeVisible();
		await expect(page.getByText("Reading lamp")).toBeVisible();
	});

	test("manual add uploads an image and the new item appears", async ({
		page,
		context,
	}) => {
		await installFakeSession(context);
		const items: FurnitureItem[] = [];
		await installBaseMocks(page, {
			listFurnitureItems: () => ({ items }),
			createFurnitureItem: (_route, body) => {
				const label = String(body?.data?.label ?? "New piece");
				const created = makeItem({ id: "item-new", label });
				items.push(created);
				return { id: created.id, label };
			},
		});

		await page.goto("/furniture");

		await expect(
			page.getByText("No furniture in your library yet")
		).toBeVisible();

		await page.locator('input[type="file"]').setInputFiles({
			name: "chair.png",
			mimeType: "image/png",
			buffer: FIXTURE_BYTES,
		});

		await page
			.getByPlaceholder("e.g. white 4-drawer dresser")
			.fill("Velvet armchair");
		await page.getByRole("button", { name: /^Save furniture$/i }).click();

		await expect(page.getByText("Velvet armchair")).toBeVisible();
		await expect(
			page.getByText("No furniture in your library yet")
		).toHaveCount(0);
	});

	test("deleting an item removes it via the confirm dialog", async ({
		page,
		context,
	}) => {
		await installFakeSession(context);
		let items: FurnitureItem[] = [
			makeItem({ id: "item-1", label: "Oak stool" }),
		];
		let deletedId: string | null = null;
		await installBaseMocks(page, {
			listFurnitureItems: () => ({ items }),
			deleteFurnitureItem: (_route, body) => {
				deletedId = String(body?.data?.furnitureItemId ?? "");
				items = items.filter((entry) => entry.id !== deletedId);
				return { ok: true };
			},
		});

		await page.goto("/furniture");

		await expect(page.getByText("Oak stool")).toBeVisible();
		await page.getByRole("button", { name: /Delete Oak stool/i }).click();

		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible();
		await expect(dialog.getByText(/Delete furniture\?/i)).toBeVisible();
		await dialog.getByRole("button", { name: /Delete furniture/i }).click();

		await expect(page.getByText("Oak stool")).toHaveCount(0);
		await expect(
			page.getByText("No furniture in your library yet")
		).toBeVisible();
		expect(deletedId).toBe("item-1");
	});
});
