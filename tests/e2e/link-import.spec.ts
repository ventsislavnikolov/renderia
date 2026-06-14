import { expect, test } from "@playwright/test";
import { installBaseMocks, installFakeSession } from "./support";

/**
 * End-to-end coverage for Link Import on the Furniture page: paste a product
 * URL, the (mocked) server extracts a candidate, the confirm form pre-fills,
 * and confirming saves the item into the library. The retailer fetch is never
 * live — `extractFurnitureCandidate` is mocked entirely, so the candidate
 * (including its photo URLs) is served from local fixtures.
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

const PRODUCT_URL = "https://retailer.example/p/gistrup-sofa";

const CANDIDATE = {
	name: "GISTRUP 3-seat sofa",
	photos: [
		"/storage/v1/object/furniture-references/product-a.png?token=fake",
		"/storage/v1/object/furniture-references/product-b.png?token=fake",
	],
	brand: "Jysk",
	price: 4999,
	currency: "BGN",
	widthCm: null,
	heightCm: null,
	depthCm: null,
};

test.describe("link import flow", () => {
	test("imports a product link, confirms, and saves it to the library", async ({
		page,
		context,
	}) => {
		await installFakeSession(context);
		const items: FurnitureItem[] = [];
		let importedWith: Record<string, unknown> | null = null;
		await installBaseMocks(page, {
			listFurnitureItems: () => ({ items }),
			extractFurnitureCandidate: () => ({
				sourceUrl: PRODUCT_URL,
				candidate: CANDIDATE,
			}),
			importFurnitureItem: (_route, body) => {
				importedWith = body?.data ?? null;
				const created: FurnitureItem = {
					id: "imported-1",
					label: String(body?.data?.label ?? CANDIDATE.name),
					source: "product",
					originalName: "product-a.png",
					signedUrl:
						"/storage/v1/object/furniture-references/imported-1.png?token=fake",
					selected: false,
					createdAt: "2026-02-01T00:00:00Z",
					sourceLink: PRODUCT_URL,
					brand: CANDIDATE.brand,
					price: CANDIDATE.price,
					currency: CANDIDATE.currency,
					widthCm: null,
					heightCm: null,
					depthCm: null,
				};
				items.push(created);
				return { id: created.id };
			},
		});

		await page.goto("/furniture");

		await page.getByPlaceholder(/Paste a product link/i).fill(PRODUCT_URL);
		await page.getByRole("button", { name: /Import from link/i }).click();

		// Confirm form pre-fills from the extracted candidate.
		await expect(
			page.getByRole("heading", { name: "Confirm import" })
		).toBeVisible();
		await expect(page.getByLabel("What is this piece?")).toHaveValue(
			"GISTRUP 3-seat sofa"
		);
		await expect(page.getByLabel("Brand")).toHaveValue("Jysk");
		await expect(page.getByLabel("Price")).toHaveValue("4999");
		await expect(page.getByLabel("Currency")).toHaveValue("BGN");

		// Both extracted photos render as Reference-Image options; the first is
		// selected by default.
		await expect(
			page.getByRole("button", { name: /Use photo 1 as the Reference Image/i })
		).toHaveAttribute("aria-pressed", "true");

		await page.getByRole("button", { name: /^Save to library$/i }).click();

		await expect(page.getByText("GISTRUP 3-seat sofa")).toBeVisible();
		expect(importedWith).toMatchObject({
			sourceUrl: PRODUCT_URL,
			label: "GISTRUP 3-seat sofa",
			brand: "Jysk",
			price: 4999,
			currency: "BGN",
		});
	});

	test("surfaces an error when extraction fails", async ({ page, context }) => {
		await installFakeSession(context);
		await installBaseMocks(page, {
			listFurnitureItems: () => ({ items: [] }),
			// Fulfil the route ourselves with a 500 so the server-fn client throws
			// and the component surfaces its error branch. Returning the
			// route.fulfill promise (→ undefined) tells the dispatcher not to
			// wrap/double-fulfil.
			extractFurnitureCandidate: (route) =>
				route.fulfill({
					status: 500,
					contentType: "application/json",
					body: JSON.stringify({ error: "Couldn't fetch that page" }),
				}),
		});

		await page.goto("/furniture");

		await page
			.getByPlaceholder(/Paste a product link/i)
			.fill("https://retailer.example/p/broken");
		await page.getByRole("button", { name: /Import from link/i }).click();

		await expect(page.getByRole("alert")).toBeVisible();
		// We never reached the confirm step.
		await expect(
			page.getByRole("heading", { name: "Confirm import" })
		).toHaveCount(0);
	});
});
