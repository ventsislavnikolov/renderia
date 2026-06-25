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
		kind: "column_beam",
		x: 0.4,
		y: 0.08,
		width: 0.5,
		height: 0.05,
		confidence: 0.85,
	},
];

const FAKE_BRIEF = {
	id: "33333333-3333-3333-3333-333333333333",
	markdown: "# Demo Task brief\n\nPreserve protected elements and apply style.",
	prompt: "PRESERVE EXACTLY main window, ceiling beam. Apply requested style.",
	version: 1,
};

const FAKE_GENERATION = {
	jobId: "44444444-4444-4444-4444-444444444444",
	images: [
		{
			id: "55555555-5555-5555-5555-000000000001",
			storagePath: `${USER_ID}/job-1-0.png`,
			signedUrl: "/storage/v1/object/generated/fake-0.png?token=fake",
			variationIndex: 0,
			isFavorite: false,
		},
		{
			id: "55555555-5555-5555-5555-000000000002",
			storagePath: `${USER_ID}/job-1-1.png`,
			signedUrl: "/storage/v1/object/generated/fake-1.png?token=fake",
			variationIndex: 1,
			isFavorite: false,
		},
		{
			id: "55555555-5555-5555-5555-000000000003",
			storagePath: `${USER_ID}/job-1-2.png`,
			signedUrl: "/storage/v1/object/generated/fake-2.png?token=fake",
			variationIndex: 2,
			isFavorite: false,
		},
		{
			id: "55555555-5555-5555-5555-000000000004",
			storagePath: `${USER_ID}/job-1-3.png`,
			signedUrl: "/storage/v1/object/generated/fake-3.png?token=fake",
			variationIndex: 3,
			isFavorite: false,
		},
	],
};

const FAKE_PREVIEW = {
	id: "66666666-6666-6666-6666-666666666666",
	storagePath: `${USER_ID}/${TASK_ID}/preview.png`,
	signedUrl:
		"/storage/v1/object/structural-previews/fake-preview.png?token=fake",
	status: "generated",
};

/**
 * Install fake session before any client script runs. We can't write
 * localStorage before navigation (it requires an active page context), so we
 * use `addInitScript` which runs on every navigation BEFORE app code.
 */
async function installFakeSession(context: BrowserContext) {
	await context.addInitScript(
		({ key, session, consentKey }) => {
			try {
				window.localStorage.setItem(key, JSON.stringify(session));
				// Dismiss the analytics consent banner: it's a fixed bottom overlay
				// that otherwise intercepts pointer events on small (mobile) viewports
				// and blocks the controls under test. "declined" keeps analytics off.
				window.localStorage.setItem(consentKey, "declined");
			} catch {
				// SSR or sandboxed iframe — nothing we can do, the auth guard
				// will redirect and the test will surface that as a failure.
			}
		},
		{
			key: SUPABASE_STORAGE_KEY,
			session: FAKE_SESSION,
			consentKey: "renderia.analytics-consent",
		}
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
	const ssrDir = path.join(__dirname, "..", "..", ".output", "server", "_ssr");
	const map = new Map<string, string>();
	let files: string[];
	try {
		files = readdirSync(ssrDir);
	} catch {
		throw new Error(
			`Expected .output/server/_ssr to exist (run \`pnpm build\` first). Missing: ${ssrDir}`
		);
	}
	const pattern =
		/var (\w+) = createServerFn\([^)]*\)(?:\.\w+\([^)]*\))*\.handler\(createSsrRpc\("([a-f0-9]{64})"\)\)/g;
	const inlinePattern =
		/createServerFn\([^)]*\)(?:\.\w+\([^)]*\))*\.handler\(createSsrRpc\("([a-f0-9]{64})"\)\)/g;
	// Newer TanStack Start codegen emits handlers as
	// `createServerRpc({ id: "<hash>", name: "<fnName>", ... })` instead of the
	// inline `createSsrRpc("<hash>")` form, so map the explicit id → name too.
	const serverRpcPattern =
		/createServerRpc\(\{\s*id:\s*"([a-f0-9]{64})",\s*name:\s*"(\w+)"/g;
	for (const file of files) {
		if (!file.endsWith(".mjs")) continue;
		const src = readFileSync(path.join(ssrDir, file), "utf8");
		for (const match of src.matchAll(serverRpcPattern)) {
			map.set(match[1] as string, match[2] as string);
		}
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

/** Shape of a `protected_elements` row that the persistence server fns return. */
type ProtectedElementMockRow = {
	id: string;
	task_id: string;
	photo_id: string;
	project_id: string;
	label: string;
	kind: string;
	x: number;
	y: number;
	width: number;
	height: number;
	confidence: number | null;
	status: string;
	created_at: string;
};

type RoomAppearanceMock = {
	id: string;
	photoId: string;
	label: string;
	kind: string;
	x: number;
	y: number;
	width: number;
	height: number;
	confidence: number | null;
	source: "ai" | "manual";
	objectId: string | null;
};

type RoomObjectMock = {
	id: string;
	label: string;
	kind: string;
	preservationMode: "exact_preserve" | "keep_type_restyle";
	appearanceIds: string[];
	isPersisted: boolean;
};

type TaskRoomStateMock = {
	photoIds: string[];
	reviewedPhotoIds: string[];
	referencePhotoId: string | null;
	appearances: RoomAppearanceMock[];
	objects: RoomObjectMock[];
	approvedPhotoIds: string[];
};

/** Track in-memory photos so the second list call sees the upload. */
type PageState = {
	photos: (typeof FAKE_PHOTO)[];
	protectedElements: ProtectedElementMockRow[];
	roomState: TaskRoomStateMock;
	preview: typeof FAKE_PREVIEW | null;
};

function buildPageState(overrides: Partial<PageState> = {}): PageState {
	return {
		photos: [],
		protectedElements: [],
		roomState: {
			photoIds: [],
			reviewedPhotoIds: [],
			referencePhotoId: null,
			appearances: [],
			objects: [],
			approvedPhotoIds: [],
		},
		preview: null,
		...overrides,
	};
}

function objectIdFor(kind: string, label: string) {
	return `${kind}:${label
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")}`;
}

function reconcileObjects(appearances: RoomAppearanceMock[]): RoomObjectMock[] {
	const groups = new Map<string, RoomAppearanceMock[]>();
	for (const appearance of appearances) {
		const objectId =
			appearance.objectId ?? objectIdFor(appearance.kind, appearance.label);
		const group = groups.get(objectId);
		if (group) group.push({ ...appearance, objectId });
		else groups.set(objectId, [{ ...appearance, objectId }]);
	}
	return Array.from(groups.entries()).map(([id, group]) => {
		const first = group[0];
		if (!first) throw new Error(`Missing appearance for ${id}`);
		return {
			id,
			label: first.label.trim().toLowerCase(),
			kind: first.kind,
			preservationMode: "exact_preserve",
			appearanceIds: group.map((entry) => entry.id),
			isPersisted: true,
		};
	});
}

function buildReviewedRoomState(): TaskRoomStateMock {
	const appearances = FAKE_DETECTION.map((box, index) => {
		const objectId = objectIdFor(box.kind, box.label);
		return {
			id: `appearance-${index}`,
			photoId: PHOTO_ID,
			label: box.label,
			kind: box.kind,
			x: box.x,
			y: box.y,
			width: box.width,
			height: box.height,
			confidence: box.confidence ?? null,
			source: "ai" as const,
			objectId,
		};
	});
	return {
		photoIds: [PHOTO_ID],
		reviewedPhotoIds: [PHOTO_ID],
		referencePhotoId: PHOTO_ID,
		appearances,
		objects: reconcileObjects(appearances),
		approvedPhotoIds: [],
	};
}

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
	await page.route(
		/\/storage\/v1\/object\/source-photos\/.*/,
		async (route) => {
			if (route.request().method() === "POST") {
				return route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ Key: FAKE_PHOTO.storage_path }),
				});
			}
			return route.fulfill({
				status: 200,
				contentType: "image/png",
				body: FIXTURE_BYTES,
			});
		}
	);

	await page.route(
		/\/storage\/v1\/object\/sign\/source-photos\/.*/,
		async (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					signedURL: "/storage/v1/object/source-photos/signed?token=fake",
					signedUrl: "/storage/v1/object/source-photos/signed?token=fake",
				}),
			})
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
		if (fnId.includes("loadTaskRoomState")) {
			// Server returns previews keyed by reference photo id (per-angle),
			// not a single preview. Mirror that shape so the preview step renders.
			const previews =
				state.preview && state.roomState.referencePhotoId
					? { [state.roomState.referencePhotoId]: state.preview }
					: {};
			return serializedResult({
				roomState: state.roomState,
				previews,
			});
		}
		if (fnId.includes("saveTaskRoomState")) {
			const body = route.request().postDataJSON() as {
				data?: { roomState?: TaskRoomStateMock };
			} | null;
			if (body?.data?.roomState) {
				state.roomState = body.data.roomState;
			}
			return serializedResult({ ok: true });
		}
		if (fnId.includes("generateStructuralPreview")) {
			const body = route.request().postDataJSON() as {
				data?: { referencePhotoId?: string };
			} | null;
			state.preview = FAKE_PREVIEW;
			const generatedPhotoId = body?.data?.referencePhotoId ?? PHOTO_ID;
			state.roomState = {
				...state.roomState,
				referencePhotoId: generatedPhotoId,
				// A fresh preview revokes that angle's approval.
				approvedPhotoIds: state.roomState.approvedPhotoIds.filter(
					(id) => id !== generatedPhotoId
				),
			};
			return serializedResult({ preview: FAKE_PREVIEW });
		}
		if (fnId.includes("approveStructuralPreview")) {
			const approvedPhotoId = state.roomState.referencePhotoId ?? PHOTO_ID;
			state.roomState = {
				...state.roomState,
				referencePhotoId: approvedPhotoId,
				approvedPhotoIds: state.roomState.approvedPhotoIds.includes(
					approvedPhotoId
				)
					? state.roomState.approvedPhotoIds
					: [...state.roomState.approvedPhotoIds, approvedPhotoId],
			};
			state.preview = { ...FAKE_PREVIEW, status: "approved" };
			return serializedResult({ ok: true });
		}
		if (fnId.includes("listProtectedElements")) {
			return serializedResult(state.protectedElements);
		}
		if (fnId.includes("saveDetectedElements")) {
			// Echo the inbound boxes back as fully-formed rows so the UI gets
			// stable db ids for subsequent toggle calls.
			const body = route.request().postDataJSON() as {
				data?: { elements?: typeof FAKE_DETECTION };
			} | null;
			const elements = body?.data?.elements ?? FAKE_DETECTION;
			const rows = elements.map((el, index) => ({
				id: `el-${index}`,
				task_id: TASK_ID,
				photo_id: PHOTO_ID,
				project_id: PROJECT_ID,
				label: el.label,
				kind: el.kind,
				x: el.x,
				y: el.y,
				width: el.width,
				height: el.height,
				confidence: el.confidence ?? null,
				status: "suggested",
				created_at: "2026-01-01T00:00:00Z",
			}));
			state.protectedElements = rows;
			return serializedResult(rows);
		}
		if (fnId.includes("updateProtectedElementStatus")) {
			const body = route.request().postDataJSON() as {
				data?: { elementId?: string; status?: string };
			} | null;
			const elementId = body?.data?.elementId ?? "el-0";
			const status = body?.data?.status ?? "confirmed";
			const existing = state.protectedElements.find((r) => r.id === elementId);
			const updated = existing
				? { ...existing, status }
				: { ...state.protectedElements[0], id: elementId, status };
			state.protectedElements = state.protectedElements.map((r) =>
				r.id === elementId ? { ...r, status } : r
			);
			return serializedResult(updated);
		}
		if (fnId.includes("detectProtectedElements")) {
			return serializedResult(FAKE_DETECTION);
		}
		if (fnId.includes("createDesignBrief")) {
			return serializedResult(FAKE_BRIEF);
		}
		if (fnId.includes("saveDesignBrief")) {
			return serializedResult(FAKE_BRIEF);
		}
		if (fnId.includes("listGeneratedImages")) {
			return serializedResult({ jobId: null, images: [] });
		}
		if (fnId.includes("generateRenovationImages")) {
			return serializedResult({ data: FAKE_GENERATION });
		}
		if (fnId.includes("setImageFavorite")) {
			return serializedResult({
				id: "55555555-5555-5555-5555-000000000001",
				is_favorite: true,
				storage_path: `${USER_ID}/job-1-0.png`,
				variation_index: 0,
			});
		}
		return serializedResult(null);
	});

	// The generation step renders <img src={signedUrl}> using the signed URLs
	// the (mocked) server fn returned. Stub the asset paths so the browser
	// doesn't 404 on them.
	await page.route(/\/storage\/v1\/object\/generated\/.*/, async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "image/png",
			body: FIXTURE_BYTES,
		});
	});
	await page.route(
		/\/storage\/v1\/object\/structural-previews\/.*/,
		async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "image/png",
				body: FIXTURE_BYTES,
			});
		}
	);
}

async function selectSamplePhotoAndContinue(page: Page) {
	await expect(
		page.getByRole("heading", { name: /Upload source photos/i })
	).toBeVisible();
	// Anchor on the filename so we hit the photo tile, not the
	// `Delete sample.png` button that sits in the same card.
	await page.getByRole("button", { name: /^sample\.png/i }).click();
	await page.getByRole("button", { name: /Continue with 1 photo/i }).click();
	await expect(
		page.getByRole("heading", { name: /Review each uploaded photo/i })
	).toBeVisible();
}

async function reviewSamplePhotoAndContinue(page: Page) {
	// Single-photo tasks show the singular "Detect photo" label.
	await page.getByRole("button", { name: /^Detect photo$/i }).click();
	await expect(
		page.getByRole("button", { name: /Edit main window/i })
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: /Edit ceiling beam/i })
	).toBeVisible();
	await page.getByRole("button", { name: /Mark this photo reviewed/i }).click();
	// Review continues straight to the structural preview.
	await page
		.getByRole("button", { name: /Continue to structural preview/i })
		.click();
	await expect(
		page.getByRole("heading", {
			name: /Approve every angle's structural preview/i,
		})
	).toBeVisible();
}

async function approveStructuralPreviewAndContinue(page: Page) {
	await expect(page.getByLabel(/Reference photo angle/i)).toHaveValue(PHOTO_ID);
	await page
		.getByRole("button", { name: /Generate structural preview/i })
		.click();
	await expect(page.getByAltText(/Structural preview/i)).toBeVisible();
	await page.getByRole("button", { name: /Approve this angle/i }).click();
	// Approving the only angle satisfies the all-angles gate and advances to the
	// read-only Room review step.
	await expect(
		page.getByRole("heading", { name: /Review the whole room/i })
	).toBeVisible();
}

async function continueFromRoomReviewToBrief(page: Page) {
	await page.getByRole("button", { name: /Continue to brief/i }).click();
	await expect(
		page.getByRole("heading", { name: /Review the design brief/i })
	).toBeVisible();
}

async function advanceToBriefStep(page: Page) {
	await selectSamplePhotoAndContinue(page);
	await reviewSamplePhotoAndContinue(page);
	await approveStructuralPreviewAndContinue(page);
	await continueFromRoomReviewToBrief(page);
}

test.describe("guided renovation workspace", () => {
	test("authenticated user sees the six-step stepper", async ({
		page,
		context,
	}) => {
		await installFakeSession(context);
		const state = buildPageState();
		await installApiMocks(page, state);

		await page.goto(TASK_URL);

		const stepper = page.getByRole("navigation", {
			name: "Guided renovation steps",
		});
		await expect(stepper).toBeVisible();
		for (const label of [
			"Upload",
			"Review",
			"Preview",
			"Room",
			"Brief",
			"Generate",
		]) {
			await expect(
				stepper.getByRole("button", { name: new RegExp(label) })
			).toBeVisible();
		}
	});

	test("upload step advances to review once a photo is selected", async ({
		page,
		context,
	}) => {
		await installFakeSession(context);
		const state = buildPageState();
		await installApiMocks(page, state);

		await page.goto(TASK_URL);

		const fileInput = page.getByLabel(/Choose photos to upload/i);
		await fileInput.setInputFiles({
			name: "sample.png",
			mimeType: "image/png",
			buffer: FIXTURE_BYTES,
		});

		// A successful upload auto-selects the new photo, so Continue is ready
		// without an extra tile click.
		await page.getByRole("button", { name: /Continue with 1 photo/i }).click();
		await expect(
			page.getByRole("heading", { name: /Review each uploaded photo/i })
		).toBeVisible();
	});

	test("saved room state can be reopened without rerunning detection", async ({
		page,
		context,
	}) => {
		await installFakeSession(context);
		const state = buildPageState({
			photos: [FAKE_PHOTO],
			roomState: buildReviewedRoomState(),
		});
		await installApiMocks(page, state);

		await page.goto(TASK_URL);
		await page.getByRole("button", { name: /^02 Review$/i }).click();

		await expect(
			page.getByRole("heading", { name: /Review each uploaded photo/i })
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: /Edit main window/i })
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: /sample\.png Reviewed/i })
		).toBeVisible();
		await page
			.getByRole("button", { name: /Continue to structural preview/i })
			.click();
		await expect(
			page.getByRole("heading", {
				name: /Approve every angle's structural preview/i,
			})
		).toBeVisible();
	});

	test("brief step generates, edits, and continues to generation", async ({
		page,
		context,
	}) => {
		await installFakeSession(context);
		const state = buildPageState({ photos: [FAKE_PHOTO] });
		await installApiMocks(page, state);

		await page.goto(TASK_URL);
		await advanceToBriefStep(page);
		await page.getByRole("button", { name: /Generate brief/i }).click();

		const textarea = page.getByLabel("Brief markdown");
		await expect(textarea).toHaveValue(/Demo Task brief/);

		await page.getByRole("button", { name: /Continue to generation/i }).click();

		await expect(
			page.getByRole("heading", { name: /Review generated variations/i })
		).toBeVisible();
	});

	test("generation step toggles favorites", async ({ page, context }) => {
		await installFakeSession(context);
		const state = buildPageState({ photos: [FAKE_PHOTO] });
		await installApiMocks(page, state);

		await page.goto(TASK_URL);
		await advanceToBriefStep(page);
		await page.getByRole("button", { name: /Generate brief/i }).click();
		// Wait for the textarea to be populated before continuing — otherwise
		// the disabled-state guard on Continue may swallow our click.
		await expect(page.getByLabel("Brief markdown")).toHaveValue(
			/Demo Task brief/
		);
		await page.getByRole("button", { name: /Continue to generation/i }).click();

		// Lock onto the first variation's favorite button via the article
		// wrapper — the button's accessible name changes from "Mark favorite"
		// to "Favorite" after the click, which would shuffle `.first()`
		// across siblings if we re-resolved by text.
		const firstCard = page.locator("article.generation-card").first();
		const favBtn = firstCard.getByRole("button");
		await favBtn.click();
		await expect(favBtn).toHaveAttribute("aria-pressed", "true");
		await expect(favBtn).toContainText(/Favorite/);
	});

	test("unauthenticated user is redirected to /sign-in", async ({
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
		await expect(page).toHaveURL(/\/sign-in/);
	});
});
