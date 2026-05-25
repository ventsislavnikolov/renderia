import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";

/**
 * End-to-end coverage for the guided renovation workspace.
 *
 * The real implementation hits Supabase Auth + REST + Storage and TanStack
 * server functions. We mock every one of those network boundaries with
 * `page.route()` so the suite is deterministic regardless of the live
 * `.env.local` Supabase project state. A fake session is pre-injected into
 * `localStorage` via `page.addInitScript` so the route guards see an
 * authenticated user before any client code runs.
 *
 * The storage key (`sb-ittpjznlewuwiyuhrddu-auth-token`) is derived by
 * `@supabase/supabase-js` from the hostname's first label (see
 * `node_modules/@supabase/supabase-js/dist/index.mjs` — `defaultStorageKey`).
 * The stored value is the raw session object JSON-serialised, NOT wrapped in
 * `currentSession` — confirmed by reading `GoTrueClient._saveSession`.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, "fixtures", "sample.png");
const FIXTURE_BYTES = readFileSync(FIXTURE_PATH);

const SUPABASE_PROJECT_REF = "ittpjznlewuwiyuhrddu";
const SUPABASE_STORAGE_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`;
const USER_ID = "00000000-0000-0000-0000-000000000001";
const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const TASK_ID = "22222222-2222-2222-2222-222222222222";
const PHOTO_ID = "33333333-3333-3333-3333-333333333333";
const TASK_URL = `/projects/${PROJECT_ID}/tasks/${TASK_ID}`;

/** Far-future expiry so the session is never considered stale during the test. */
const FAR_FUTURE = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;

const FAKE_SESSION = {
	access_token: "fake-jwt-for-e2e",
	refresh_token: "fake-refresh-for-e2e",
	token_type: "bearer",
	expires_in: 3600,
	expires_at: FAR_FUTURE,
	user: {
		id: USER_ID,
		aud: "authenticated",
		role: "authenticated",
		email: "e2e@example.com",
		app_metadata: { provider: "email" },
		user_metadata: {},
		created_at: "2026-01-01T00:00:00Z",
		updated_at: "2026-01-01T00:00:00Z",
	},
};

const FAKE_PROJECT = {
	id: PROJECT_ID,
	owner_id: USER_ID,
	name: "Demo Renovation",
	description: "E2E test project",
	created_at: "2026-01-01T00:00:00Z",
	updated_at: "2026-01-01T00:00:00Z",
};

const FAKE_TASK = {
	id: TASK_ID,
	owner_id: USER_ID,
	project_id: PROJECT_ID,
	title: "Demo Task",
	category: "kitchen",
	status: "active",
	notes: null,
	created_at: "2026-01-01T00:00:00Z",
	updated_at: "2026-01-01T00:00:00Z",
};

const FAKE_PHOTO = {
	id: PHOTO_ID,
	owner_id: USER_ID,
	project_id: PROJECT_ID,
	storage_bucket: "source-photos",
	storage_path: `${USER_ID}/${Date.now()}-sample.png`,
	original_name: "sample.png",
	content_type: "image/png",
	width: 1,
	height: 1,
	notes: null,
	created_at: "2026-01-01T00:00:00Z",
};

const FAKE_DETECTION = [
	{
		label: "main window",
		kind: "window",
		x: 0.12,
		y: 0.2,
		width: 0.2,
		height: 0.3,
		confidence: 0.9,
	},
	{
		label: "ceiling beam",
		kind: "ceiling_line",
		x: 0.4,
		y: 0.08,
		width: 0.5,
		height: 0.05,
		confidence: 0.85,
	},
];

const FAKE_BRIEF = {
	markdown: "# Demo Task brief\n\nPreserve protected elements and apply style.",
	prompt: "PRESERVE EXACTLY main window, ceiling beam. Apply requested style.",
};

/**
 * Install fake session before any client script runs. We can't write
 * localStorage before navigation (it requires an active page context), so we
 * use `addInitScript` which runs on every navigation BEFORE app code.
 */
async function installFakeSession(context: BrowserContext) {
	await context.addInitScript(
		({ key, session }) => {
			try {
				window.localStorage.setItem(key, JSON.stringify(session));
			} catch {
				// SSR or sandboxed iframe — nothing we can do, the auth guard
				// will redirect and the test will surface that as a failure.
			}
		},
		{ key: SUPABASE_STORAGE_KEY, session: FAKE_SESSION },
	);
}

/**
 * Build a hash → server-fn-name lookup by scanning the production SSR
 * bundles. TanStack assigns each `createServerFn` invocation a 64-char hex id
 * derived from the source path + function name. The id is stable across
 * builds with identical source, but we resolve it dynamically so the test
 * keeps working when the project structure shifts.
 */
function buildServerFnHashMap(): Map<string, string> {
	const ssrDir = path.join(
		__dirname,
		"..",
		"..",
		".output",
		"server",
		"_ssr",
	);
	const map = new Map<string, string>();
	let files: string[];
	try {
		files = readdirSync(ssrDir);
	} catch {
		throw new Error(
			`Expected .output/server/_ssr to exist (run \`pnpm build\` first). Missing: ${ssrDir}`,
		);
	}
	const pattern =
		/var (\w+) = createServerFn\([^)]*\)(?:\.\w+\([^)]*\))*\.handler\(createSsrRpc\("([a-f0-9]{64})"\)\)/g;
	const inlinePattern =
		/createServerFn\([^)]*\)(?:\.\w+\([^)]*\))*\.handler\(createSsrRpc\("([a-f0-9]{64})"\)\)/g;
	for (const file of files) {
		if (!file.endsWith(".mjs")) continue;
		const src = readFileSync(path.join(ssrDir, file), "utf8");
		for (const match of src.matchAll(pattern)) {
			map.set(match[2] as string, match[1] as string);
		}
		// Anonymous server fns (e.g. `suggestTasksForProject` is assigned but
		// not destructured) — best-effort capture by surrounding context.
		for (const match of src.matchAll(inlinePattern)) {
			if (!map.has(match[1] as string)) {
				// Walk backwards in the file to find the nearest `var X =`.
				const idx = (match.index ?? 0) - 200;
				const slice = src.slice(Math.max(0, idx), match.index);
				const nameMatch = /var (\w+)\s*=\s*$/m.exec(slice);
				if (nameMatch) map.set(match[1] as string, nameMatch[1] as string);
			}
		}
	}
	return map;
}

const SERVER_FN_BY_HASH = buildServerFnHashMap();

/** Track in-memory photos so the second list call sees the upload. */
type PageState = { photos: typeof FAKE_PHOTO[] };

/**
 * Register every network mock we need for the guided flow to operate without
 * touching the real Supabase project.
 *
 * Order matters in Playwright — `page.route()` handlers run last-registered
 * first. We register specific URLs before the catch-all so the dev server
 * still serves the real bundle.
 */
async function installApiMocks(page: Page, state: PageState) {
	// --- Supabase Auth: /auth/v1/user (called by getUser) and /auth/v1/token (refresh) ---
	await page.route(/\/auth\/v1\/user(\?.*)?$/, async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(FAKE_SESSION.user),
		});
	});

	await page.route(/\/auth\/v1\/token(\?.*)?$/, async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(FAKE_SESSION),
		});
	});

	// --- Supabase REST (PostgREST) ---
	await page.route(/\/rest\/v1\/.*/, async (route) => {
		const url = new URL(route.request().url());
		const table = url.pathname.split("/rest/v1/")[1]?.split("?")[0];
		const method = route.request().method();

		if (table === "projects" && method === "GET") {
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify([FAKE_PROJECT]),
			});
		}
		if (table === "renovation_tasks" && method === "GET") {
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify([FAKE_TASK]),
			});
		}
		if (table === "photos" && method === "GET") {
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(state.photos),
			});
		}
		if (table === "photos" && method === "POST") {
			state.photos = [FAKE_PHOTO];
			return route.fulfill({
				status: 201,
				contentType: "application/json",
				body: JSON.stringify(FAKE_PHOTO),
			});
		}
		return route.fulfill({
			status: 200,
			contentType: "application/json",
			body: "[]",
		});
	});

	// --- Supabase Storage: upload + signed URL minting ---
	await page.route(/\/storage\/v1\/object\/source-photos\/.*/, async (route) => {
		if (route.request().method() === "POST") {
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ Key: FAKE_PHOTO.storage_path }),
			});
		}
		return route.fulfill({ status: 200, body: "" });
	});

	await page.route(
		/\/storage\/v1\/object\/sign\/source-photos\/.*/,
		async (route) => {
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					signedURL: "/storage/v1/object/source-photos/signed?token=fake",
					signedUrl: "/storage/v1/object/source-photos/signed?token=fake",
				}),
			});
		},
	);

	// --- TanStack server functions ---
	await page.route(/\/_serverFn\/.*/, async (route) => {
		const url = new URL(route.request().url());
		const hash = url.pathname.split("/_serverFn/")[1] ?? "";
		const fnId = SERVER_FN_BY_HASH.get(hash) ?? hash;

		// TanStack's server-fn middleware (`serverFnBaseToMiddleware`) treats
		// the fetcher result as the `userCtx` argument to `next()`. The
		// next-middleware reader picks `userCtx.result` if defined,
		// `userCtx.error` for failures, and `userCtx.context` to merge into
		// the request context. Wrap accordingly so the route handler sees
		// the unwrapped data.
		const serializedResult = (data: unknown) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ result: data, context: {}, error: null }),
			});

		if (fnId.includes("listProjectPhotos")) {
			return serializedResult(state.photos);
		}
		if (fnId.includes("createPhotoRecord")) {
			state.photos = [FAKE_PHOTO];
			return serializedResult(FAKE_PHOTO);
		}
		if (fnId.includes("listProjectTasks")) {
			return serializedResult([FAKE_TASK]);
		}
		if (fnId.includes("detectProtectedElements")) {
			return serializedResult(FAKE_DETECTION);
		}
		if (fnId.includes("createDesignBrief")) {
			return serializedResult(FAKE_BRIEF);
		}
		return serializedResult(null);
	});
}

test.describe("guided renovation workspace", () => {
	test("authenticated user sees the four-step stepper", async ({
		page,
		context,
	}) => {
		await installFakeSession(context);
		const state: PageState = { photos: [] };
		await installApiMocks(page, state);

		await page.goto(TASK_URL);

		const stepper = page.getByRole("navigation", {
			name: "Guided renovation steps",
		});
		await expect(stepper).toBeVisible();
		for (const label of ["Upload", "Confirm", "Brief", "Generate"]) {
			await expect(
				stepper.getByRole("button", { name: new RegExp(label) }),
			).toBeVisible();
		}
	});

	test("upload step advances to overlay confirm once a photo is selected", async ({
		page,
		context,
	}) => {
		await installFakeSession(context);
		const state: PageState = { photos: [] };
		await installApiMocks(page, state);

		await page.goto(TASK_URL);

		await expect(
			page.getByRole("heading", { name: /Upload a source photo/i }),
		).toBeVisible();

		const fileInput = page.getByLabel(/Choose a photo to upload/i);
		await fileInput.setInputFiles({
			name: "sample.png",
			mimeType: "image/png",
			buffer: FIXTURE_BYTES,
		});

		await expect(
			page.getByRole("heading", { name: /Confirm protected elements/i }),
		).toBeVisible();
	});

	test("detect protected elements renders the bounding boxes", async ({
		page,
		context,
	}) => {
		await installFakeSession(context);
		const state: PageState = { photos: [FAKE_PHOTO] };
		await installApiMocks(page, state);

		await page.goto(TASK_URL);

		// Jump straight to the overlay step by selecting the existing photo
		// tile rather than uploading. This keeps the test focused on the
		// detection UI rather than the upload happy-path (already covered).
		await page.getByRole("button", { name: /sample\.png/ }).click();

		const detectBtn = page.getByRole("button", {
			name: /Detect protected elements/i,
		});
		await expect(detectBtn).toBeEnabled();
		await detectBtn.click();

		await expect(
			page.getByRole("button", { name: /Toggle main window protection/i }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: /Toggle ceiling beam protection/i }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: /Confirm selection and continue/i }),
		).toBeVisible();
	});

	test("brief step generates, edits, and continues to generation", async ({
		page,
		context,
	}) => {
		await installFakeSession(context);
		const state: PageState = { photos: [FAKE_PHOTO] };
		await installApiMocks(page, state);

		await page.goto(TASK_URL);
		await page.getByRole("button", { name: /sample\.png/ }).click();
		await page
			.getByRole("button", { name: /Detect protected elements/i })
			.click();
		await page
			.getByRole("button", { name: /Confirm selection and continue/i })
			.click();

		await expect(
			page.getByRole("heading", { name: /Review the design brief/i }),
		).toBeVisible();
		await page.getByRole("button", { name: /Generate brief/i }).click();

		const textarea = page.getByLabel("Brief markdown");
		await expect(textarea).toHaveValue(/Demo Task brief/);

		await page
			.getByRole("button", { name: /Continue to generation/i })
			.click();

		await expect(
			page.getByRole("heading", { name: /Review generated variations/i }),
		).toBeVisible();
	});

	test("generation step toggles favorites", async ({ page, context }) => {
		await installFakeSession(context);
		const state: PageState = { photos: [FAKE_PHOTO] };
		await installApiMocks(page, state);

		await page.goto(TASK_URL);
		await page.getByRole("button", { name: /sample\.png/ }).click();
		await page
			.getByRole("button", { name: /Detect protected elements/i })
			.click();
		await page
			.getByRole("button", { name: /Confirm selection and continue/i })
			.click();
		await page.getByRole("button", { name: /Generate brief/i }).click();
		// Wait for the textarea to be populated before continuing — otherwise
		// the disabled-state guard on Continue may swallow our click.
		await expect(page.getByLabel("Brief markdown")).toHaveValue(
			/Demo Task brief/,
		);
		await page
			.getByRole("button", { name: /Continue to generation/i })
			.click();

		// Lock onto the first variation's favorite button via the article
		// wrapper — the button's accessible name changes from "Mark favorite"
		// to "Favorite" after the click, which would shuffle `.first()`
		// across siblings if we re-resolved by text.
		const firstCard = page.locator("article.generation-card").first();
		const favBtn = firstCard.getByRole("button");
		await favBtn.click();
		await expect(favBtn).toHaveAttribute("aria-pressed", "true");
		await expect(favBtn).toContainText(/★ Favorite/);
	});

	test("unauthenticated user is redirected to /auth", async ({
		page,
		context,
	}) => {
		// No `installFakeSession` here — the route guard should redirect.
		await context.addInitScript(() => {
			try {
				window.localStorage.clear();
			} catch {
				/* noop */
			}
		});

		await page.goto(TASK_URL);
		await expect(page).toHaveURL(/\/auth/);
	});
});
