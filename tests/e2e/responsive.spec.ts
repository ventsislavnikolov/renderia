import { expect, type Page, test } from "@playwright/test";
import {
	installBaseMocks,
	installFakeSession,
	PROJECT_ID,
	TASK_ID,
	USER_ID,
} from "./support";

/**
 * Responsive / horizontal-overflow guard for every shipped page.
 *
 * For each page × viewport we wait for the primary content to be visible, then
 * assert the document has no horizontal overflow (`scrollWidth` may exceed the
 * viewport by at most 1px of sub-pixel rounding). A full-page screenshot is
 * saved to `/tmp/responsive-65/` so the layout can be eyeballed. The Supabase +
 * server-fn boundaries are mocked through the shared `support` helpers; the
 * room-state mock mirrors the shape `loadTaskRoomState` returns so the task
 * workspace renders its first guided step.
 */

const VIEWPORTS = [
	{ name: "mobile", width: 375, height: 667 },
	{ name: "tablet", width: 768, height: 1024 },
	{ name: "desktop", width: 1280, height: 800 },
] as const;

const SCREENSHOT_DIR = "/tmp/responsive-65";

/**
 * A deliberately long, unbroken token. Long unbroken strings are the classic
 * trigger for horizontal overflow, so the populated fixtures embed one to make
 * sure the layouts wrap/truncate instead of pushing the document wider.
 */
const LONG_LABEL =
	"Scandinavian-walnut-and-brushed-brass-extendable-dining-table-with-removable-leaf";

const FAVORITE_IMAGES = Array.from({ length: 6 }, (_, index) => ({
	id: `fav-${index}`,
	signedUrl: `/storage/v1/object/generated/fav-${index}.png?token=fake`,
	variationIndex: index % 4,
	contents: [LONG_LABEL, "rattan pendant light", "oak dining table"],
	createdAt: "2026-01-02T00:00:00Z",
	taskId: TASK_ID,
	taskTitle: "Demo Task",
	projectId: PROJECT_ID,
	projectName: LONG_LABEL,
}));

const FURNITURE_ITEMS = Array.from({ length: 6 }, (_, index) => ({
	id: `item-${index}`,
	label: index === 0 ? LONG_LABEL : `Furniture piece ${index}`,
	source: "product" as const,
	originalName: `piece-${index}.png`,
	signedUrl: `/storage/v1/object/furniture-references/item-${index}.png?token=fake`,
	selected: false,
	createdAt: "2026-01-01T00:00:00Z",
	sourceLink:
		index === 0 ? `https://www.example-retailer.com/${LONG_LABEL}` : null,
	brand: index === 0 ? LONG_LABEL : null,
	price: index === 0 ? 12_499 : null,
	currency: index === 0 ? "EUR" : null,
	widthCm: index === 0 ? 240 : null,
	heightCm: index === 0 ? 76 : null,
	depthCm: index === 0 ? 100 : null,
}));

const PROJECTS = Array.from({ length: 5 }, (_, index) => ({
	id:
		index === 0
			? PROJECT_ID
			: `1111111${index}-1111-1111-1111-11111111111${index}`,
	owner_id: USER_ID,
	name: index === 0 ? LONG_LABEL : `Project ${index}`,
	description: index === 0 ? `${LONG_LABEL} ${LONG_LABEL}` : "A renovation.",
	created_at: "2026-01-01T00:00:00Z",
	updated_at: "2026-01-01T00:00:00Z",
}));

const TASKS = Array.from({ length: 4 }, (_, index) => ({
	id:
		index === 0
			? TASK_ID
			: `2222222${index}-2222-2222-2222-22222222222${index}`,
	owner_id: USER_ID,
	project_id: PROJECT_ID,
	title: index === 0 ? LONG_LABEL : `Task ${index}`,
	category: "kitchen",
	status: "active",
	notes: null,
	created_at: "2026-01-01T00:00:00Z",
	updated_at: "2026-01-01T00:00:00Z",
}));

const EMPTY_ROOM_STATE = {
	roomState: {
		photoIds: [],
		reviewedPhotoIds: [],
		referencePhotoId: null,
		appearances: [],
		objects: [],
		approvedPhotoIds: [],
	},
	previews: {},
};

async function assertNoHorizontalOverflow(
	page: Page,
	label: string,
	width: number
) {
	const overflow = await page.evaluate(
		() =>
			document.documentElement.scrollWidth -
			document.documentElement.clientWidth
	);
	expect(
		overflow,
		`horizontal overflow on "${label}" at ${width}px (scrollWidth - clientWidth = ${overflow}px)`
	).toBeLessThanOrEqual(1);
}

async function screenshot(page: Page, label: string, width: number) {
	await page.screenshot({
		path: `${SCREENSHOT_DIR}/${label}-${width}.png`,
		fullPage: true,
	});
}

type PageCase = {
	label: string;
	path: string;
	requiresSession: boolean;
	mocks?: Parameters<typeof installBaseMocks>[1];
	ready: (page: Page) => Promise<void>;
};

const PAGE_CASES: PageCase[] = [
	{
		label: "home",
		path: "/",
		requiresSession: true,
		ready: (page) =>
			expect(
				page.getByRole("heading", { name: /What should we build/i })
			).toBeVisible(),
	},
	{
		label: "projects",
		path: "/projects",
		requiresSession: true,
		mocks: {
			listProjects: () => PROJECTS,
			listProjectTasks: () => TASKS,
		},
		ready: (page) =>
			expect(page.getByRole("heading", { name: /Projects/i })).toBeVisible(),
	},
	{
		label: "project-detail",
		path: `/projects/${PROJECT_ID}`,
		requiresSession: true,
		mocks: {
			listProjects: () => PROJECTS,
			listProjectTasks: () => TASKS,
		},
		ready: (page) =>
			expect(
				page.getByRole("heading", { name: "Rooms" }).first()
			).toBeVisible(),
	},
	{
		label: "task-workspace",
		path: `/projects/${PROJECT_ID}/tasks/${TASK_ID}`,
		requiresSession: true,
		mocks: { loadTaskRoomState: () => EMPTY_ROOM_STATE },
		ready: (page) =>
			expect(
				page.getByRole("navigation", { name: "Guided renovation steps" })
			).toBeVisible(),
	},
	{
		label: "favorites",
		path: "/favorites",
		requiresSession: true,
		mocks: { listFavoriteImages: () => ({ images: FAVORITE_IMAGES }) },
		ready: (page) =>
			expect(page.getByRole("heading", { name: "Favorites" })).toBeVisible(),
	},
	{
		label: "furniture",
		path: "/furniture",
		requiresSession: true,
		mocks: { listFurnitureItems: () => ({ items: FURNITURE_ITEMS }) },
		ready: (page) =>
			expect(
				page.getByRole("heading", { level: 1, name: "Furniture" })
			).toBeVisible(),
	},
	{
		label: "sign-in",
		path: "/sign-in",
		requiresSession: false,
		ready: (page) =>
			expect(
				page.getByRole("heading", { name: "Welcome to Renderia" })
			).toBeVisible(),
	},
];

test.describe("responsive overflow guard", () => {
	for (const pageCase of PAGE_CASES) {
		test(`"${pageCase.label}" has no horizontal overflow at any viewport`, async ({
			page,
			context,
		}) => {
			if (pageCase.requiresSession) {
				await installFakeSession(context);
				await installBaseMocks(page, pageCase.mocks);
			}

			for (const viewport of VIEWPORTS) {
				await page.setViewportSize({
					width: viewport.width,
					height: viewport.height,
				});
				await page.goto(pageCase.path);
				await pageCase.ready(page);
				await screenshot(page, pageCase.label, viewport.width);
				await assertNoHorizontalOverflow(page, pageCase.label, viewport.width);
			}
		});
	}
});
