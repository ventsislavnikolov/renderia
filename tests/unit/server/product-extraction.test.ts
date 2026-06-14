import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
	extractProductCandidate,
	parseDimensionsFromText,
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

	it("reads name/photos/price from an Amazon JSON-LD AggregateOffer page", () => {
		const candidate = extractProductCandidate(
			readFixture("amazon-product.html"),
			"https://www.amazon.com/dp/B0VASAGLE"
		);

		// JSON-LD name wins over the OG fallback.
		expect(candidate.name).toBe("VASAGLE Coffee Table, Rustic Brown");
		expect(candidate.photos).toEqual([
			"https://m.media-amazon.com/images/vasagle-front.jpg",
			"https://www.amazon.com/images/vasagle-detail.jpg",
		]);
		expect(candidate.brand).toBe("VASAGLE");
		// AggregateOffer exposes lowPrice rather than price.
		expect(candidate.price).toBe(59.99);
		expect(candidate.currency).toBe("USD");
	});

	it("falls back to schema.org microdata when there is no JSON-LD (IDdesign)", () => {
		const candidate = extractProductCandidate(
			readFixture("iddesign-product.html"),
			"https://www.iddesign.dk/sofaer/soren-3-pers"
		);

		expect(candidate.name).toBe("SØREN 3-pers. sofa, mørkegrå");
		expect(candidate.photos).toEqual([
			"https://cdn.iddesign.dk/soren-front.jpg",
			"https://www.iddesign.dk/media/soren-side.jpg",
		]);
		expect(candidate.brand).toBe("IDdesign");
		// Machine-readable `content` is preferred over the "4.999 kr." text.
		expect(candidate.price).toBe(4999);
		expect(candidate.currency).toBe("DKK");
	});

	it("reads microdata exposed via meta itemprop tags (Westwing)", () => {
		const candidate = extractProductCandidate(
			readFixture("westwing-product.html"),
			"https://www.westwing.de/samt-sessel-diana"
		);

		expect(candidate.name).toBe("Samt-Sessel Diana, Petrol");
		expect(candidate.photos).toEqual([
			"https://image.westwing.de/diana-1.jpg",
			"https://image.westwing.de/diana-2.jpg",
		]);
		expect(candidate.brand).toBe("Westwing Collection");
		expect(candidate.price).toBe(299);
		expect(candidate.currency).toBe("EUR");
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

describe("parseDimensionsFromText", () => {
	it("parses English labels in centimetres", () => {
		expect(
			parseDimensionsFromText("Width: 100 cm, Height: 45 cm, Depth: 50 cm")
		).toEqual({ widthCm: 100, heightCm: 45, depthCm: 50 });
	});

	it("converts millimetres to centimetres", () => {
		expect(
			parseDimensionsFromText("Width 1500 mm · Height 900 mm · Depth 805 mm")
		).toEqual({ widthCm: 150, heightCm: 90, depthCm: 80.5 });
	});

	it("parses localized labels (German, Bulgarian, Danish)", () => {
		expect(
			parseDimensionsFromText("Breite 72 cm, Höhe 89 cm, Tiefe 60 cm")
		).toEqual({ widthCm: 72, heightCm: 89, depthCm: 60 });

		expect(
			parseDimensionsFromText(
				"Ширина: 192 см, Височина: 84 см, Дълбочина: 84 см"
			)
		).toEqual({ widthCm: 192, heightCm: 84, depthCm: 84 });

		expect(
			parseDimensionsFromText("Bredde: 220 cm Højde: 88 cm Dybde: 95 cm")
		).toEqual({ widthCm: 220, heightCm: 88, depthCm: 95 });
	});

	it("accepts decimal commas and assumes centimetres when the unit is absent", () => {
		expect(parseDimensionsFromText("Width 80,5")).toEqual({
			widthCm: 80.5,
			heightCm: null,
			depthCm: null,
		});
	});

	it("returns nulls when no dimension labels are present", () => {
		expect(
			parseDimensionsFromText("A comfortable lounge chair in green.")
		).toEqual({ widthCm: null, heightCm: null, depthCm: null });
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
