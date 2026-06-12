import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import {
	__extractFurnitureCandidateHandler,
	FURNITURE_IMPORT_USER_AGENT,
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
