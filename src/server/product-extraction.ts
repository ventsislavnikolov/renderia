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
	/**
	 * Dimensions in centimetres, sourced from schema.org Product
	 * width/height/depth when present. Almost always null for the verified
	 * retailers (Jysk/IKEA ship no structured dimensions) — the import flow
	 * fills the gaps with an AI pass over the page text.
	 */
	widthCm: number | null;
	heightCm: number | null;
	depthCm: number | null;
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

/** UN/CEFACT unit codes → centimetre multiplier. Unknown/absent ⇒ assume cm. */
const UNIT_TO_CM: Record<string, number> = {
	CMT: 1,
	MMT: 0.1,
	MTR: 100,
	INH: 2.54,
};

/** Parse a finite, strictly-positive number from a JSON value (number or string). */
function parsePositiveNumber(value: JsonValue): number | null {
	if (typeof value === "number") {
		return Number.isFinite(value) && value > 0 ? value : null;
	}
	const text = asNonEmptyString(value);
	if (!text) return null;
	const parsed = Number.parseFloat(text.replace(",", "."));
	return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Read a schema.org dimension as centimetres. Handles a `QuantitativeValue`
 * (`{ value, unitCode }`) and a bare number/string. An unrecognized or absent
 * unit code is treated as centimetres.
 */
function parseDimensionCm(value: JsonValue): number | null {
	if (isObject(value)) {
		const raw = parsePositiveNumber(value.value);
		if (raw === null) return null;
		const unit = asNonEmptyString(value.unitCode);
		const factor = unit ? (UNIT_TO_CM[unit.toUpperCase()] ?? 1) : 1;
		return raw * factor;
	}
	return parsePositiveNumber(value);
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

	const widthCm = product ? parseDimensionCm(product.width ?? null) : null;
	const heightCm = product ? parseDimensionCm(product.height ?? null) : null;
	const depthCm = product ? parseDimensionCm(product.depth ?? null) : null;

	return { name, photos, brand, price, currency, widthCm, heightCm, depthCm };
}

const STRIP_BLOCK_PATTERN =
	/<(script|style|template|noscript)\b[\s\S]*?<\/\1>/gi;
const TAG_PATTERN = /<[^>]+>/g;
const MAX_STRIPPED_TEXT_LENGTH = 12_000;

/**
 * Reduce product-page HTML to plain text for the AI dimension pass: drop
 * script/style/template blocks, strip the remaining tags, decode a few common
 * entities, collapse whitespace, and cap the length so the prompt stays
 * bounded. Pure and deterministic — no parser, no network.
 */
export function stripHtmlToText(html: string): string {
	const withoutBlocks = html.replace(STRIP_BLOCK_PATTERN, " ");
	const withoutTags = withoutBlocks.replace(TAG_PATTERN, " ");
	const decoded = withoutTags
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.replace(/&#0*39;/gi, "'");
	const collapsed = decoded.replace(/\s+/g, " ").trim();
	return collapsed.slice(0, MAX_STRIPPED_TEXT_LENGTH);
}
