import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserContext, Page, Route } from "@playwright/test";

/**
 * Shared Playwright fixtures for the Furniture / Favorites / Link-Import E2E
 * specs.
 *
 * The reusable building blocks here mirror the ones first developed inline in
 * `guided-workspace.spec.ts`: a fake Supabase session injected into
 * `localStorage` before any app code runs, plus a `/_serverFn/<hash>` router
 * that resolves TanStack Start's content-addressed handler ids back to the
 * source function name by scanning the production SSR bundle. See the long
 * comments in that spec for the derivation of the storage key and the bundle
 * scanning patterns.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, "fixtures", "sample.png");

export const FIXTURE_BYTES = readFileSync(FIXTURE_PATH);

const SUPABASE_PROJECT_REF = "ittpjznlewuwiyuhrddu";
const SUPABASE_STORAGE_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`;

export const USER_ID = "00000000-0000-0000-0000-000000000001";
export const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
export const TASK_ID = "22222222-2222-2222-2222-222222222222";

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

/**
 * Install the fake session before any client script runs. localStorage can't
 * be written before navigation (it needs an active page context), so we use
 * `addInitScript` which runs on every navigation BEFORE app code.
 */
export async function installFakeSession(context: BrowserContext) {
	await context.addInitScript(
		({ key, session }) => {
			try {
				window.localStorage.setItem(key, JSON.stringify(session));
			} catch {
				// SSR or sandboxed iframe — the auth guard will redirect and the
				// test surfaces that as a failure.
			}
		},
		{ key: SUPABASE_STORAGE_KEY, session: FAKE_SESSION }
	);
}

/**
 * Build a hash → server-fn-name lookup by scanning the production SSR bundles.
 * TanStack assigns each `createServerFn` invocation a 64-char hex id derived
 * from the source path + function name; we resolve it dynamically so the suite
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
		for (const match of src.matchAll(inlinePattern)) {
			if (!map.has(match[1] as string)) {
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

/**
 * TanStack Start serializes POST server-fn bodies with seroval's cross-JSON
 * encoder, NOT plain JSON. `route.request().postDataJSON()` therefore returns
 * a node graph (`{ t: <node>, f, m }`) rather than `{ data: {...} }`, so a
 * naive `body.data.foo` read always yields `undefined`. Decode the graph back
 * into the original value here so spec handlers can inspect the real payload.
 *
 * Only the node kinds TanStack emits for server-fn inputs are handled:
 * number(0), string(1), constant(2), bigint(3), reference(4), array(9),
 * object(10). The `i`/`o`/`m` ref bookkeeping is honoured so shared
 * sub-objects deserialize correctly.
 */
type SerovalNode = {
	t: number;
	i?: number;
	s?: string | number;
	a?: SerovalNode[];
	p?: { k: string[]; v: SerovalNode[] };
	o?: number;
};

const SEROVAL_CONSTANTS: Record<number, unknown> = {
	0: null,
	1: undefined,
	2: true,
	3: false,
	4: Number.NaN,
	5: Number.POSITIVE_INFINITY,
	6: Number.NEGATIVE_INFINITY,
	7: -0,
};

function decodeSerovalNode(
	node: SerovalNode,
	refs: Map<number, unknown>
): unknown {
	switch (node.t) {
		case 0: // number
			return node.s as number;
		case 1: // string
			return node.s as string;
		case 2: // constant (null / undefined / boolean / special number)
			return SEROVAL_CONSTANTS[node.s as number];
		case 3: // bigint
			return BigInt(String(node.s));
		case 4: // reference to a previously-seen node
			return refs.get(node.i as number);
		case 9: {
			// array
			const arr: unknown[] = [];
			if (node.i !== undefined) refs.set(node.i, arr);
			for (const item of node.a ?? []) arr.push(decodeSerovalNode(item, refs));
			return arr;
		}
		case 10: {
			// object
			const obj: Record<string, unknown> = {};
			if (node.i !== undefined) refs.set(node.i, obj);
			const keys = node.p?.k ?? [];
			const values = node.p?.v ?? [];
			for (let index = 0; index < keys.length; index += 1) {
				obj[keys[index] as string] = decodeSerovalNode(
					values[index] as SerovalNode,
					refs
				);
			}
			return obj;
		}
		default:
			return;
	}
}

/**
 * Decode a server-fn POST body. Falls back to the raw parsed JSON when the
 * payload isn't the seroval envelope (e.g. an older plain-JSON request shape),
 * so the helper stays robust across TanStack versions.
 */
function decodeServerFnBody(
	raw: unknown
): { data?: Record<string, unknown> } | null {
	if (
		raw &&
		typeof raw === "object" &&
		"t" in (raw as Record<string, unknown>)
	) {
		const envelope = raw as { t: SerovalNode };
		return decodeSerovalNode(envelope.t, new Map()) as {
			data?: Record<string, unknown>;
		} | null;
	}
	return raw as { data?: Record<string, unknown> } | null;
}

/** Fulfil a server-fn route with the unwrapped-data envelope the middleware expects. */
function fulfilServerFn(route: Route, data: unknown) {
	return route.fulfill({
		status: 200,
		contentType: "application/json",
		body: JSON.stringify({ result: data, context: {}, error: null }),
	});
}

/** A spec-supplied server-fn handler. Returns the unwrapped result data. */
export type ServerFnHandler = (
	route: Route,
	body: { data?: Record<string, unknown> } | null
) => unknown | Promise<unknown>;

/**
 * Register every network boundary the authenticated app shell touches, then
 * dispatch `/_serverFn/*` calls through `handlers` keyed by a substring of the
 * resolved function name. Unmatched calls fall back to shell defaults
 * (`listProjects` / `listProjectTasks`) and finally `null`, so specs only have
 * to declare the handlers their flow actually exercises.
 */
export async function installBaseMocks(
	page: Page,
	handlers: Record<string, ServerFnHandler> = {}
) {
	await page.route(/\/auth\/v1\/user(\?.*)?$/, (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(FAKE_SESSION.user),
		})
	);
	await page.route(/\/auth\/v1\/token(\?.*)?$/, (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(FAKE_SESSION),
		})
	);

	await page.route(/\/rest\/v1\/.*/, (route) => {
		const url = new URL(route.request().url());
		const table = url.pathname.split("/rest/v1/")[1]?.split("?")[0];
		if (table === "projects") {
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify([FAKE_PROJECT]),
			});
		}
		if (table === "renovation_tasks") {
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify([FAKE_TASK]),
			});
		}
		return route.fulfill({
			status: 200,
			contentType: "application/json",
			body: "[]",
		});
	});

	await page.route(/\/_serverFn\/.*/, async (route) => {
		const url = new URL(route.request().url());
		const hash = url.pathname.split("/_serverFn/")[1] ?? "";
		const fnId = SERVER_FN_BY_HASH.get(hash) ?? hash;
		const body =
			route.request().method() === "GET"
				? null
				: decodeServerFnBody(route.request().postDataJSON());

		for (const [key, handler] of Object.entries(handlers)) {
			if (fnId.includes(key)) {
				const result = await handler(route, body);
				// A handler that fulfils the route itself (e.g. to simulate an HTTP
				// error) returns undefined — don't double-fulfil in that case.
				if (result === undefined) return;
				return fulfilServerFn(route, result);
			}
		}

		if (fnId.includes("listProjects"))
			return fulfilServerFn(route, [FAKE_PROJECT]);
		if (fnId.includes("listProjectTasks"))
			return fulfilServerFn(route, [FAKE_TASK]);
		return fulfilServerFn(route, null);
	});

	// Storage object route. POST is an upload (the manual-add flow streams the
	// chosen file straight into the furniture bucket) — answer with the JSON
	// envelope `@supabase/supabase-js` expects. Any other method is an <img>
	// read, so return the fixture bytes to keep the browser from 404-ing.
	await page.route(
		/\/storage\/v1\/object\/(generated|furniture-references|source-photos)\/.*/,
		(route) => {
			if (route.request().method() === "POST") {
				const url = new URL(route.request().url());
				const key = url.pathname.split("/storage/v1/object/")[1] ?? "";
				return route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ Id: "fake-id", Key: key }),
				});
			}
			return route.fulfill({
				status: 200,
				contentType: "image/png",
				body: FIXTURE_BYTES,
			});
		}
	);
}
