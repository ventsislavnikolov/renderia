import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
	extractProductCandidate,
	stripHtmlToText,
} from "../../../src/server/product-extraction";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function readFixture(name: string): string {
	return readFileSync(join(fixturesDir, name), "utf8");
}

describe("extractProductCandidate", () => {
	it("extracts name, photos, brand, and price from the Jysk fixture", () => {
		const candidate = extractProductCandidate(
			readFixture("jysk-product.html"),
			"https://jysk.bg/divani/divan-gistrup-3-mesten"
		);

		expect(candidate).toEqual({
			name: "Диван GISTRUP 3-местен тъмнозелен",
			photos: [
				"https://sky.jysk.bg/2048/2719/gistrup-front.jpg",
				"https://sky.jysk.bg/2048/2719/gistrup-side.jpg",
				// Relative image URLs resolve against the page URL.
				"https://jysk.bg/media/2719/gistrup-detail.jpg",
			],
			brand: "JYSK",
			price: 799,
			currency: "BGN",
			widthCm: null,
			heightCm: null,
			depthCm: null,
		});
	});

	it("extracts from the IKEA fixture's @graph with ImageObject photos", () => {
		const candidate = extractProductCandidate(
			readFixture("ikea-product.html"),
			"https://www.ikea.bg/p/udsbjerg-kreslo-50506991"
		);

		expect(candidate).toEqual({
			name: "UDSBJERG кресло, зелено",
			photos: [
				"https://www.ikea.bg/images/products/udsbjerg-front.jpg",
				"https://www.ikea.bg/images/products/udsbjerg-angle.jpg",
			],
			brand: "IKEA",
			price: 449,
			currency: "BGN",
			widthCm: null,
			heightCm: null,
			depthCm: null,
		});
	});

	it("falls back to OG tags when there is no Product JSON-LD", () => {
		const candidate = extractProductCandidate(
			readFixture("og-only-product.html"),
			"https://nordicliving.example/products/oslo-lounge-chair"
		);

		expect(candidate).toEqual({
			name: "Oslo lounge chair",
			photos: [
				"https://cdn.nordicliving.example/oslo-1.jpg",
				"https://nordicliving.example/assets/oslo-2.jpg",
			],
			brand: null,
			price: 1299.5,
			currency: "EUR",
			widthCm: null,
			heightCm: null,
			depthCm: null,
		});
	});

	it("returns graceful nulls for a non-product page", () => {
		const candidate = extractProductCandidate(
			readFixture("non-product.html"),
			"https://jysk.bg/delivery"
		);

		expect(candidate).toEqual({
			name: null,
			photos: [],
			brand: null,
			price: null,
			currency: null,
			widthCm: null,
			heightCm: null,
			depthCm: null,
		});
	});

	it("never throws on malformed JSON-LD or broken markup", () => {
		const html = `<html><head>
			<script type="application/ld+json">{ not json at all</script>
			<script type="application/ld+json">{"@type":"Product","name":"Broken chair","offers":{"price":"not-a-number"}}</script>
			<body><p>unclosed`;

		const candidate = extractProductCandidate(html, "https://example.com/p/1");

		expect(candidate.name).toBe("Broken chair");
		expect(candidate.price).toBeNull();
		expect(candidate.currency).toBeNull();
	});

	it("returns all nulls for empty input", () => {
		expect(extractProductCandidate("", "https://example.com")).toEqual({
			name: null,
			photos: [],
			brand: null,
			price: null,
			currency: null,
			widthCm: null,
			heightCm: null,
			depthCm: null,
		});
	});

	it("drops non-http(s) and unresolvable image URLs", () => {
		const html = `<script type="application/ld+json">
			{"@type":"Product","name":"Chair","image":["javascript:alert(1)","data:image/png;base64,xyz","https://ok.example/a.jpg"]}
		</script>`;

		const candidate = extractProductCandidate(html, "https://example.com/p/1");

		expect(candidate.photos).toEqual(["https://ok.example/a.jpg"]);
	});

	it("reads schema.org QuantitativeValue dimensions, converting units to cm", () => {
		const html = `<script type="application/ld+json">{
			"@type":"Product","name":"Shelf",
			"width":{"@type":"QuantitativeValue","value":"80","unitCode":"CMT"},
			"height":{"@type":"QuantitativeValue","value":"2","unitCode":"MTR"},
			"depth":{"@type":"QuantitativeValue","value":"350","unitCode":"MMT"}
		}</script>`;

		const candidate = extractProductCandidate(html, "https://example.com/p/1");

		expect(candidate.widthCm).toBe(80);
		expect(candidate.heightCm).toBe(200);
		expect(candidate.depthCm).toBe(35);
	});

	it("treats a bare numeric dimension as centimetres and ignores non-positive values", () => {
		const html = `<script type="application/ld+json">{
			"@type":"Product","name":"Stool","width":45,"height":"0","depth":"abc"
		}</script>`;

		const candidate = extractProductCandidate(html, "https://example.com/p/1");

		expect(candidate.widthCm).toBe(45);
		expect(candidate.heightCm).toBeNull();
		expect(candidate.depthCm).toBeNull();
	});
});

describe("stripHtmlToText", () => {
	it("drops script/style blocks and tags, collapses whitespace", () => {
		const html = `<html><head><style>.x{color:red}</style>
			<script>var a = "210cm";</script></head>
			<body><h1>Sofa</h1><p>Width:&nbsp;210&nbsp;cm,
			Depth: 95 cm</p></body></html>`;

		const text = stripHtmlToText(html);

		expect(text).toContain("Sofa");
		expect(text).toContain("Width: 210 cm, Depth: 95 cm");
		expect(text).not.toContain("color:red");
		expect(text).not.toContain("var a");
		expect(text).not.toContain("<");
	});

	it("caps the output length so the prompt stays bounded", () => {
		const text = stripHtmlToText(`<p>${"word ".repeat(5000)}</p>`);

		expect(text.length).toBeLessThanOrEqual(12_000);
	});
});
