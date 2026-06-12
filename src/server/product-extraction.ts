/**
 * Pure product-page extraction for Link Import.
 *
 * `extractProductCandidate(html, url)` parses schema.org Product JSON-LD
 * (verified present on jysk.bg and ikea.bg product pages) and falls back to
 * OpenGraph tags, returning the structured candidate that pre-fills the
 * import confirm form. Every field is best-effort and nullable — the user
 * edits the form before anything persists, so a miss here is never fatal.
 *
 * Deliberately dependency-free: lightweight regex scans for `ld+json`
 * scripts and `meta` tags keep the function deterministic and
 * fixture-testable without an HTML parser or network access.
 */

export type ProductExtractionCandidate = {
	name: string | null;
	/** Absolute http(s) URLs, in page order, deduplicated. */
	photos: string[];
	brand: string | null;
	price: number | null;
	currency: string | null;
};

const LD_JSON_SCRIPT_PATTERN =
	/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const META_TAG_PATTERN = /<meta\b[^>]*>/gi;
const META_ATTR_PATTERN =
	/(property|name|content)\s*=\s*("([^"]*)"|'([^']*)')/gi;

type JsonValue = unknown;
type JsonObject = Record<string, JsonValue>;

function isObject(value: JsonValue): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: JsonValue): string | null {
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: null;
}

/** Walk a parsed JSON-LD document (including `@graph` and arrays) for the first Product node. */
function findProductNode(value: JsonValue): JsonObject | null {
	if (Array.isArray(value)) {
		for (const entry of value) {
			const found = findProductNode(entry);
			if (found) return found;
		}
		return null;
	}
	if (!isObject(value)) return null;
	const type = value["@type"];
	const types = Array.isArray(type) ? type : [type];
	if (
		types.some((t) => typeof t === "string" && t.toLowerCase() === "product")
	) {
		return value;
	}
	return findProductNode(value["@graph"] ?? null);
}

function parseProductJsonLd(html: string): JsonObject | null {
	for (const match of html.matchAll(LD_JSON_SCRIPT_PATTERN)) {
		const raw = match[1];
		if (!raw) continue;
		try {
			const product = findProductNode(JSON.parse(raw));
			if (product) return product;
		} catch {
			// Malformed JSON-LD block — skip it and keep scanning.
		}
	}
	return null;
}

/** Resolve to an absolute http(s) URL against the page, or null. */
function toAbsoluteHttpUrl(candidate: string, pageUrl: string): string | null {
	try {
		const resolved = new URL(candidate, pageUrl);
		return resolved.protocol === "http:" || resolved.protocol === "https:"
			? resolved.href
			: null;
	} catch {
		return null;
	}
}

function collectImageUrls(value: JsonValue, pageUrl: string): string[] {
	const entries = Array.isArray(value) ? value : [value];
	const urls: string[] = [];
	for (const entry of entries) {
		const raw = isObject(entry)
			? asNonEmptyString(entry.url ?? entry.contentUrl)
			: asNonEmptyString(entry);
		const absolute = raw ? toAbsoluteHttpUrl(raw, pageUrl) : null;
		if (absolute && !urls.includes(absolute)) urls.push(absolute);
	}
	return urls;
}

function extractBrand(value: JsonValue): string | null {
	if (isObject(value)) return asNonEmptyString(value.name);
	return asNonEmptyString(value);
}

function parsePrice(value: JsonValue): number | null {
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : null;
	}
	const text = asNonEmptyString(value);
	if (!text) return null;
	const parsed = Number.parseFloat(text.replace(",", "."));
	return Number.isFinite(parsed) ? parsed : null;
}

function extractOffer(value: JsonValue): {
	price: number | null;
	currency: string | null;
} {
	const offers = Array.isArray(value) ? value : [value];
	for (const offer of offers) {
		if (!isObject(offer)) continue;
		// AggregateOffer carries lowPrice instead of price.
		const price = parsePrice(offer.price ?? offer.lowPrice);
		const currency = asNonEmptyString(offer.priceCurrency);
		if (price !== null || currency !== null) return { price, currency };
	}
	return { price: null, currency: null };
}

/** All meta tags as (property-or-name, content) pairs, in document order. */
function readMetaTags(html: string): { key: string; content: string }[] {
	const tags: { key: string; content: string }[] = [];
	for (const tag of html.matchAll(META_TAG_PATTERN)) {
		let key: string | null = null;
		let content: string | null = null;
		for (const attr of tag[0].matchAll(META_ATTR_PATTERN)) {
			const attrName = attr[1]?.toLowerCase();
			const attrValue = attr[3] ?? attr[4] ?? "";
			if (attrName === "content") content = attrValue;
			else key = attrValue.toLowerCase();
		}
		if (key && content) tags.push({ key, content });
	}
	return tags;
}

function metaContent(
	tags: { key: string; content: string }[],
	...keys: string[]
): string | null {
	for (const key of keys) {
		const tag = tags.find((t) => t.key === key);
		if (tag) return asNonEmptyString(tag.content);
	}
	return null;
}

/**
 * Extract a product candidate from raw page HTML. Pure over (html, url) —
 * no network, no throw: malformed or non-product pages yield nulls and an
 * empty photo list.
 */
export function extractProductCandidate(
	html: string,
	pageUrl: string
): ProductExtractionCandidate {
	const product = parseProductJsonLd(html);
	const meta = readMetaTags(html);

	const name =
		(product ? asNonEmptyString(product.name) : null) ??
		metaContent(meta, "og:title");

	let photos = product ? collectImageUrls(product.image ?? [], pageUrl) : [];
	if (photos.length === 0) {
		photos = collectImageUrls(
			meta.filter((t) => t.key === "og:image").map((t) => t.content),
			pageUrl
		);
	}

	const brand = product ? extractBrand(product.brand ?? null) : null;

	let { price, currency } = product
		? extractOffer(product.offers ?? null)
		: { price: null, currency: null };
	if (price === null) {
		price = parsePrice(
			metaContent(meta, "product:price:amount", "og:price:amount")
		);
		currency = metaContent(meta, "product:price:currency", "og:price:currency");
	}

	return { name, photos, brand, price, currency };
}
