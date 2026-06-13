import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import type {
	FurnitureDimensions,
	RenovationAiProvider,
} from "../../../src/lib/ai/types";
import {
	__extractFurnitureCandidateHandler,
	__importFurnitureItemHandler,
	FURNITURE_IMPORT_USER_AGENT,
	MAX_IMPORT_IMAGE_BYTES,
	MAX_IMPORT_PAGE_BYTES,
} from "../../../src/server/furniture-import";

const PAGE_URL = "https://jysk.bg/divani/divan-gistrup-3-mesten";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function readFixture(name: string): string {
	return readFileSync(join(fixturesDir, name), "utf8");
}

/**
 * Injected-fetch stub: answers `/robots.txt` with `robots` and every other
 * URL with `page`. Either can be a thrower to simulate network failure.
 */
function buildFetch(opts: { robots?: () => Response; page?: () => Response }) {
	return vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
		const url = String(input);
		if (url.endsWith("/robots.txt")) {
			return Promise.resolve(
				opts.robots ? opts.robots() : new Response("", { status: 404 })
			);
		}
		return Promise.resolve(
			opts.page
				? opts.page()
				: new Response(readFixture("jysk-product.html"), { status: 200 })
		);
	}) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe("extractFurnitureCandidateHandler", () => {
	it("fetches the page and returns the extraction candidate", async () => {
		const fetchImpl = buildFetch({});

		const result = await __extractFurnitureCandidateHandler({
			input: { url: PAGE_URL },
			fetchImpl,
		});

		expect(result.sourceUrl).toBe(PAGE_URL);
		expect(result.candidate.name).toBe("Диван GISTRUP 3-местен тъмнозелен");
		expect(result.candidate.brand).toBe("JYSK");
		expect(result.candidate.price).toBe(799);
		expect(result.candidate.currency).toBe("BGN");
		expect(result.candidate.photos).toHaveLength(3);
	});

	it("sends the honest User-Agent on both robots and page fetches", async () => {
		const fetchImpl = buildFetch({
			robots: () => new Response("User-agent: *\nAllow: /", { status: 200 }),
		});

		await __extractFurnitureCandidateHandler({
			input: { url: PAGE_URL },
			fetchImpl,
		});

		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
			"https://jysk.bg/robots.txt"
		);
		for (const call of fetchImpl.mock.calls) {
			const headers = (call[1] as RequestInit).headers as Record<
				string,
				string
			>;
			expect(headers["User-Agent"]).toBe(FURNITURE_IMPORT_USER_AGENT);
		}
	});

	it("refuses pages robots.txt disallows and never fetches them", async () => {
		const fetchImpl = buildFetch({
			robots: () =>
				new Response("User-agent: *\nDisallow: /divani/", { status: 200 }),
		});

		await expect(
			__extractFurnitureCandidateHandler({
				input: { url: PAGE_URL },
				fetchImpl,
			})
		).rejects.toThrow(/doesn't allow automated access.*manually/i);
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it("honours a group addressed to our own user-agent token", async () => {
		const fetchImpl = buildFetch({
			robots: () =>
				new Response(
					"User-agent: RenderiaLinkImport\nDisallow: /\n\nUser-agent: *\nAllow: /",
					{ status: 200 }
				),
		});

		await expect(
			__extractFurnitureCandidateHandler({
				input: { url: PAGE_URL },
				fetchImpl,
			})
		).rejects.toThrow(/doesn't allow automated access/i);
	});

	it("proceeds when robots.txt disallows only other paths", async () => {
		const fetchImpl = buildFetch({
			robots: () =>
				new Response("User-agent: *\nDisallow: /checkout/", { status: 200 }),
		});

		const result = await __extractFurnitureCandidateHandler({
			input: { url: PAGE_URL },
			fetchImpl,
		});
		expect(result.candidate.name).not.toBeNull();
	});

	it("proceeds when robots.txt is unreachable", async () => {
		const fetchImpl = buildFetch({
			robots: () => {
				throw new Error("ECONNRESET");
			},
		});

		const result = await __extractFurnitureCandidateHandler({
			input: { url: PAGE_URL },
			fetchImpl,
		});
		expect(result.candidate.name).not.toBeNull();
	});

	it("maps HTTP error statuses to a clear, actionable message", async () => {
		const fetchImpl = buildFetch({
			page: () => new Response("gone", { status: 404 }),
		});

		await expect(
			__extractFurnitureCandidateHandler({
				input: { url: PAGE_URL },
				fetchImpl,
			})
		).rejects.toThrow(/HTTP 404.*manually/i);
	});

	it("maps network failures to a clear, actionable message", async () => {
		const fetchImpl = buildFetch({
			page: () => {
				throw new TypeError("fetch failed");
			},
		});

		await expect(
			__extractFurnitureCandidateHandler({
				input: { url: PAGE_URL },
				fetchImpl,
			})
		).rejects.toThrow(/couldn't be reached.*manually/i);
	});

	it("rejects pages whose declared size exceeds the cap", async () => {
		const fetchImpl = buildFetch({
			page: () =>
				new Response("<html></html>", {
					status: 200,
					headers: {
						"Content-Length": String(MAX_IMPORT_PAGE_BYTES + 1),
					},
				}),
		});

		await expect(
			__extractFurnitureCandidateHandler({
				input: { url: PAGE_URL },
				fetchImpl,
			})
		).rejects.toThrow(/too large/i);
	});

	it("stops reading a body that exceeds the cap mid-stream", async () => {
		const oversized = "x".repeat(MAX_IMPORT_PAGE_BYTES + 1024);
		const fetchImpl = buildFetch({
			page: () => new Response(oversized, { status: 200 }),
		});

		await expect(
			__extractFurnitureCandidateHandler({
				input: { url: PAGE_URL },
				fetchImpl,
			})
		).rejects.toThrow(/too large/i);
	});

	it.each([
		"http://localhost:5173/admin",
		"http://127.0.0.1/secret",
		"http://10.0.0.5/internal",
		"http://192.168.1.1/router",
		"http://169.254.169.254/latest/meta-data",
		"http://[::1]/loopback",
		"ftp://jysk.bg/file",
	])("rejects non-public URL %s without fetching", async (url) => {
		const fetchImpl = buildFetch({});

		await expect(
			__extractFurnitureCandidateHandler({ input: { url }, fetchImpl })
		).rejects.toThrow(/public.*product pages/i);
		expect(fetchImpl).not.toHaveBeenCalled();
	});
});

/**
 * Stub the AI provider's dimension method only — the extract handler touches
 * nothing else on the provider. Returns the spy so tests can assert call count
 * and the stripped page text it received.
 */
function buildDimensionsProvider(
	impl: () => Promise<{ value: FurnitureDimensions }>
): {
	provider: RenovationAiProvider;
	extractFurnitureDimensions: ReturnType<typeof vi.fn>;
} {
	const extractFurnitureDimensions = vi.fn(impl);
	return {
		provider: { extractFurnitureDimensions } as unknown as RenovationAiProvider,
		extractFurnitureDimensions,
	};
}

/** Minimal Product page with only the JSON-LD dimensions a test needs. */
function productHtml(dimensionsJson: string): string {
	return `<html><head><script type="application/ld+json">{
		"@type":"Product","name":"Tall shelf",
		"image":["https://cdn.example/shelf.jpg"]${dimensionsJson}
	}</script></head><body><p>A nice shelf.</p></body></html>`;
}

describe("extractFurnitureCandidateHandler — AI dimension fill", () => {
	it("fills blank dimensions from the AI provider over the stripped page text", async () => {
		const fetchImpl = buildFetch({});
		const { provider, extractFurnitureDimensions } = buildDimensionsProvider(
			() =>
				Promise.resolve({ value: { widthCm: 210, heightCm: 85, depthCm: 95 } })
		);

		const result = await __extractFurnitureCandidateHandler({
			input: { url: PAGE_URL },
			fetchImpl,
			aiProvider: provider,
		});

		expect(result.candidate.widthCm).toBe(210);
		expect(result.candidate.heightCm).toBe(85);
		expect(result.candidate.depthCm).toBe(95);

		// The provider receives plain text (HTML stripped) plus the product name.
		expect(extractFurnitureDimensions).toHaveBeenCalledTimes(1);
		const arg = extractFurnitureDimensions.mock.calls[0]?.[0] as {
			pageText: string;
			productName: string | null;
		};
		expect(arg.pageText).not.toContain("<");
		expect(arg.productName).toBe("Диван GISTRUP 3-местен тъмнозелен");
	});

	it("keeps JSON-LD-sourced dimensions and only fills the gaps", async () => {
		const fetchImpl = buildFetch({
			page: () =>
				new Response(
					productHtml(
						',"width":{"@type":"QuantitativeValue","value":"80","unitCode":"CMT"}'
					),
					{ status: 200 }
				),
		});
		// The provider would return a different width — it must not win.
		const { provider } = buildDimensionsProvider(() =>
			Promise.resolve({ value: { widthCm: 999, heightCm: 180, depthCm: 30 } })
		);

		const result = await __extractFurnitureCandidateHandler({
			input: { url: PAGE_URL },
			fetchImpl,
			aiProvider: provider,
		});

		expect(result.candidate.widthCm).toBe(80);
		expect(result.candidate.heightCm).toBe(180);
		expect(result.candidate.depthCm).toBe(30);
	});

	it("skips the AI call when JSON-LD already supplied all three dimensions", async () => {
		const fetchImpl = buildFetch({
			page: () =>
				new Response(
					productHtml(
						',"width":{"@type":"QuantitativeValue","value":"80","unitCode":"CMT"},"height":{"@type":"QuantitativeValue","value":"180","unitCode":"CMT"},"depth":{"@type":"QuantitativeValue","value":"30","unitCode":"CMT"}'
					),
					{ status: 200 }
				),
		});
		const { provider, extractFurnitureDimensions } = buildDimensionsProvider(
			() => Promise.resolve({ value: { widthCm: 1, heightCm: 1, depthCm: 1 } })
		);

		const result = await __extractFurnitureCandidateHandler({
			input: { url: PAGE_URL },
			fetchImpl,
			aiProvider: provider,
		});

		expect(extractFurnitureDimensions).not.toHaveBeenCalled();
		expect(result.candidate.widthCm).toBe(80);
		expect(result.candidate.heightCm).toBe(180);
		expect(result.candidate.depthCm).toBe(30);
	});

	it("degrades to blank dimensions when the provider fails, never blocking the import", async () => {
		const fetchImpl = buildFetch({});
		const { provider } = buildDimensionsProvider(() =>
			Promise.reject(new Error("model unavailable"))
		);

		const result = await __extractFurnitureCandidateHandler({
			input: { url: PAGE_URL },
			fetchImpl,
			aiProvider: provider,
		});

		// Import still succeeds with the rest of the candidate intact.
		expect(result.candidate.name).toBe("Диван GISTRUP 3-местен тъмнозелен");
		expect(result.candidate.widthCm).toBeNull();
		expect(result.candidate.heightCm).toBeNull();
		expect(result.candidate.depthCm).toBeNull();
	});
});

const SOURCE_URL = "https://jysk.bg/divani/divan-gistrup-3-mesten";
const PHOTO_URL = "https://jysk.bg/cdn/divan-gistrup.jpg";

/**
 * Supabase stub for the confirm/insert half: records the storage upload and
 * resolves the `furniture_items` insert chain with the created row.
 */
function buildImportSupabase(
	opts: {
		uploadError?: unknown;
		insertResult?: { data: Record<string, unknown> | null; error: unknown };
	} = {}
) {
	const upload = vi.fn(() =>
		Promise.resolve({ data: {}, error: opts.uploadError ?? null })
	);
	const single = vi.fn(() =>
		Promise.resolve(
			opts.insertResult ?? { data: { id: "item-1" }, error: null }
		)
	);
	const itemsChain: Record<string, (...args: unknown[]) => unknown> = {};
	itemsChain.insert = vi.fn(() => itemsChain);
	itemsChain.select = vi.fn(() => itemsChain);
	itemsChain.single = single;
	const from = vi.fn(() => itemsChain);
	const storageFrom = vi.fn(() => ({ upload }));
	return {
		supabase: {
			from,
			storage: { from: storageFrom },
		} as unknown as Parameters<
			typeof __importFurnitureItemHandler
		>[0]["supabase"],
		upload,
		from,
		itemsChain,
	};
}

/** PNG-ish bytes; sharp may or may not decode them in CI, both paths are fine. */
function buildImageFetch(opts: { ok?: boolean; body?: BodyInit } = {}) {
	return vi.fn(() =>
		Promise.resolve(
			new Response(opts.body ?? "fake-image-bytes", {
				status: opts.ok === false ? 404 : 200,
			})
		)
	) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe("importFurnitureItemHandler", () => {
	const baseInput = {
		sourceUrl: SOURCE_URL,
		photoUrl: PHOTO_URL,
		label: "GISTRUP sofa",
		brand: "JYSK",
		price: 799,
		currency: "BGN",
		widthCm: null,
		heightCm: null,
		depthCm: null,
	};

	it("downloads the photo, stores it server-side, and inserts the item", async () => {
		const fetchImpl = buildImageFetch();
		const { supabase, upload, from } = buildImportSupabase();

		const result = await __importFurnitureItemHandler({
			userId: "11111111-1111-1111-1111-111111111111",
			supabase,
			input: baseInput,
			fetchImpl,
		});

		expect(result.id).toBe("item-1");
		expect(fetchImpl).toHaveBeenCalledTimes(1);
		expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(PHOTO_URL);
		// Image stored by Renderia, never hotlinked.
		expect(upload).toHaveBeenCalledTimes(1);
		const [storagePath, , uploadOpts] = upload.mock.calls[0] as unknown as [
			string,
			unknown,
			{ contentType: string },
		];
		expect(storagePath).toMatch(
			/^11111111-1111-1111-1111-111111111111\/[\dA-Za-z._-]+\.png$/
		);
		expect(uploadOpts.contentType).toBe("image/png");
		// Inserted with source_link and source=product.
		const insertArg = (
			from.mock.results[0]?.value as { insert: ReturnType<typeof vi.fn> }
		).insert.mock.calls[0]?.[0] as Record<string, unknown>;
		expect(insertArg.source).toBe("product");
		expect(insertArg.source_link).toBe(SOURCE_URL);
		expect(insertArg.brand).toBe("JYSK");
		expect(insertArg.price).toBe(799);
	});

	it("sends the honest User-Agent when downloading the photo", async () => {
		const fetchImpl = buildImageFetch();
		const { supabase } = buildImportSupabase();

		await __importFurnitureItemHandler({
			userId: "11111111-1111-1111-1111-111111111111",
			supabase,
			input: baseInput,
			fetchImpl,
		});

		const headers = (fetchImpl.mock.calls[0]?.[1] as RequestInit)
			.headers as Record<string, string>;
		expect(headers["User-Agent"]).toBe(FURNITURE_IMPORT_USER_AGENT);
	});

	it("rejects a photo whose declared size exceeds the cap", async () => {
		const fetchImpl = vi.fn(() =>
			Promise.resolve(
				new Response("x", {
					status: 200,
					headers: { "Content-Length": String(MAX_IMPORT_IMAGE_BYTES + 1) },
				})
			)
		) as unknown as typeof fetch;
		const { supabase, upload } = buildImportSupabase();

		await expect(
			__importFurnitureItemHandler({
				userId: "11111111-1111-1111-1111-111111111111",
				supabase,
				input: baseInput,
				fetchImpl,
			})
		).rejects.toThrow(/couldn't be imported|manually/i);
		expect(upload).not.toHaveBeenCalled();
	});

	it("maps a failed photo download to an actionable message", async () => {
		const fetchImpl = buildImageFetch({ ok: false });
		const { supabase, upload } = buildImportSupabase();

		await expect(
			__importFurnitureItemHandler({
				userId: "11111111-1111-1111-1111-111111111111",
				supabase,
				input: baseInput,
				fetchImpl,
			})
		).rejects.toThrow(/couldn't be downloaded.*manually/i);
		expect(upload).not.toHaveBeenCalled();
	});

	it.each([
		"http://localhost/secret.png",
		"http://169.254.169.254/meta.png",
		"ftp://jysk.bg/file.png",
	])("rejects a non-public photo URL %s without fetching", async (photoUrl) => {
		const fetchImpl = buildImageFetch();
		const { supabase } = buildImportSupabase();

		await expect(
			__importFurnitureItemHandler({
				userId: "11111111-1111-1111-1111-111111111111",
				supabase,
				input: { ...baseInput, photoUrl },
				fetchImpl,
			})
		).rejects.toThrow(/public.*product pages/i);
		expect(fetchImpl).not.toHaveBeenCalled();
	});
});

describe("Link Import end-to-end (VEN-634)", () => {
	it("extracts a pasted URL then saves it as a Furniture Item with its Source Link", async () => {
		// 1. Paste URL → extraction: fetch the page and parse a candidate.
		const pageFetch = buildFetch({});
		const { sourceUrl, candidate } = await __extractFurnitureCandidateHandler({
			input: { url: PAGE_URL },
			fetchImpl: pageFetch,
		});
		expect(candidate.name).toBe("Диван GISTRUP 3-местен тъмнозелен");
		expect(candidate.photos.length).toBeGreaterThan(0);

		// 2. Confirm form → save: map the candidate the way the UI does
		//    (label ← name, Reference Image ← first photo, metadata carried over).
		const confirmInput = {
			sourceUrl,
			photoUrl: candidate.photos[0] as string,
			label: candidate.name ?? "",
			brand: candidate.brand,
			price: candidate.price,
			currency: candidate.currency,
			widthCm: null,
			heightCm: null,
			depthCm: null,
		};

		const imageFetch = buildImageFetch();
		const { supabase, upload, from } = buildImportSupabase();
		const created = await __importFurnitureItemHandler({
			userId: "11111111-1111-1111-1111-111111111111",
			supabase,
			input: confirmInput,
			fetchImpl: imageFetch,
		});

		// 3. The chosen photo was stored by Renderia, never hotlinked.
		expect(created.id).toBe("item-1");
		expect(String(imageFetch.mock.calls[0]?.[0])).toBe(candidate.photos[0]);
		expect(upload).toHaveBeenCalledTimes(1);

		// 4. The saved item carries the extracted metadata and its Source Link.
		const insertArg = (
			from.mock.results[0]?.value as { insert: ReturnType<typeof vi.fn> }
		).insert.mock.calls[0]?.[0] as Record<string, unknown>;
		expect(insertArg.source).toBe("product");
		expect(insertArg.source_link).toBe(PAGE_URL);
		expect(insertArg.label).toBe("Диван GISTRUP 3-местен тъмнозелен");
		expect(insertArg.brand).toBe("JYSK");
		expect(insertArg.price).toBe(799);
		expect(insertArg.currency).toBe("BGN");
	});
});
