import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { getRenovationAiProvider } from "../lib/ai/provider";
import type { RenovationAiProvider } from "../lib/ai/types";
import {
	type ExtractFurnitureCandidateInput,
	extractFurnitureCandidateSchema,
	type ImportFurnitureItemInput,
	importFurnitureItemSchema,
} from "../lib/renovation/schema";
import {
	readBearerToken,
	requireAuthedSupabase,
	wrapSupabaseError,
} from "../lib/supabase/server";
import type { Database } from "../lib/types/database";
import { __createFurnitureItemHandler } from "./furniture";
import { normalizeImageToPng } from "./image-normalize";
import {
	extractProductCandidate,
	type ProductExtractionCandidate,
	parseDimensionsFromText,
	stripHtmlToText,
} from "./product-extraction";

/**
 * Link Import server half: fetch a retailer product page and return the
 * extraction candidate that pre-fills the confirm form. Nothing persists
 * here — saving happens in a separate confirm step once the user has edited
 * the form and picked a Reference Image.
 *
 * Fetch hygiene, per the PRD: honest User-Agent, robots.txt respected,
 * response size-capped, public hosts only. One page per paste — no crawling,
 * no caching of retailer HTML beyond the request.
 */

export const FURNITURE_IMPORT_USER_AGENT =
	"RenderiaLinkImport/1.0 (+https://renderia.app)";

/** Product token robots.txt groups are matched against. */
const ROBOTS_PRODUCT_TOKEN = "RenderiaLinkImport";

export const MAX_IMPORT_PAGE_BYTES = 2 * 1024 * 1024;

/** Reference Image download cap — mirrors the bucket's 10 MB upload limit. */
export const MAX_IMPORT_IMAGE_BYTES = 10 * 1024 * 1024;

const FURNITURE_BUCKET = "furniture-references" as const;

const FETCH_TIMEOUT_MS = 15_000;

const IMAGE_INVALID_MESSAGE =
	"That photo couldn't be imported. Pick another photo or add the item manually.";
const IMAGE_UNREACHABLE_MESSAGE =
	"The photo couldn't be downloaded. Pick another photo or add the item manually.";

const INVALID_URL_MESSAGE =
	"Only public http(s) product pages can be imported. Check the link or add the item manually.";
const ROBOTS_BLOCKED_MESSAGE =
	"This site doesn't allow automated access to that page (robots.txt). Add the item manually instead.";
const UNREACHABLE_MESSAGE =
	"The page couldn't be reached. Check the link or add the item manually.";
const TOO_LARGE_MESSAGE =
	"The page is too large to import. Add the item manually instead.";

function httpStatusMessage(status: number): string {
	return `The page couldn't be fetched (HTTP ${status}). Check the link or add the item manually.`;
}

const PRIVATE_IPV4_PATTERNS = [
	/^0\./,
	/^10\./,
	/^127\./,
	/^169\.254\./,
	/^172\.(1[6-9]|2\d|3[01])\./,
	/^192\.168\./,
];

function isPrivateHost(rawHostname: string): boolean {
	const hostname = rawHostname.replace(/^\[|\]$/g, "").toLowerCase();
	if (
		hostname === "localhost" ||
		hostname.endsWith(".localhost") ||
		hostname.endsWith(".local") ||
		hostname.endsWith(".internal")
	) {
		return true;
	}
	if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
		return PRIVATE_IPV4_PATTERNS.some((pattern) => pattern.test(hostname));
	}
	// IPv6 literals: loopback/unspecified, unique-local (fc00::/7), link-local.
	if (hostname.includes(":")) {
		return (
			hostname === "::1" ||
			hostname === "::" ||
			hostname.startsWith("fc") ||
			hostname.startsWith("fd") ||
			hostname.startsWith("fe80")
		);
	}
	return false;
}

function parsePublicHttpUrl(raw: string): URL {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new Error(INVALID_URL_MESSAGE);
	}
	const isHttp = url.protocol === "http:" || url.protocol === "https:";
	if (!isHttp || isPrivateHost(url.hostname)) {
		throw new Error(INVALID_URL_MESSAGE);
	}
	return url;
}

type RobotsRule = { allow: boolean; pattern: string };

/** Convert a robots.txt path pattern (`*` wildcard, `$` anchor) to a RegExp. */
function robotsPatternToRegExp(pattern: string): RegExp {
	const escaped = pattern
		.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
		.replace(/\*/g, ".*");
	const anchored = escaped.endsWith("\\$")
		? `${escaped.slice(0, -2)}$`
		: escaped;
	return new RegExp(`^${anchored}`);
}

/**
 * Minimal RFC 9309 evaluation: groups addressed to our product token win
 * over `*` groups; within the applicable rules the longest matching pattern
 * decides, allow winning ties. No matching rule means allowed.
 */
function isPathAllowedByRobots(robotsTxt: string, path: string): boolean {
	const token = ROBOTS_PRODUCT_TOKEN.toLowerCase();
	const specificRules: RobotsRule[] = [];
	const genericRules: RobotsRule[] = [];
	let currentRules: RobotsRule[] | null = null;
	let inAgentHeader = false;

	for (const rawLine of robotsTxt.split(/\r?\n/)) {
		const line = rawLine.split("#")[0].trim();
		if (!line) continue;
		const separator = line.indexOf(":");
		if (separator === -1) continue;
		const field = line.slice(0, separator).trim().toLowerCase();
		const value = line.slice(separator + 1).trim();

		if (field === "user-agent") {
			const agent = value.toLowerCase();
			const target =
				agent === "*"
					? genericRules
					: token.includes(agent) || agent.includes(token)
						? specificRules
						: null;
			// Consecutive user-agent lines share the same group.
			currentRules = inAgentHeader ? (target ?? currentRules) : target;
			inAgentHeader = true;
			continue;
		}
		inAgentHeader = false;
		// An empty disallow means "allow everything" — no rule needed.
		if ((field === "allow" || field === "disallow") && currentRules && value) {
			currentRules.push({ allow: field === "allow", pattern: value });
		}
	}

	const rules = specificRules.length > 0 ? specificRules : genericRules;
	let verdict = true;
	let longestMatch = -1;
	for (const rule of rules) {
		if (!robotsPatternToRegExp(rule.pattern).test(path)) continue;
		const length = rule.pattern.length;
		if (length > longestMatch || (length === longestMatch && rule.allow)) {
			longestMatch = length;
			verdict = rule.allow;
		}
	}
	return verdict;
}

function buildRequestInit(): RequestInit {
	return {
		headers: {
			"User-Agent": FURNITURE_IMPORT_USER_AGENT,
			Accept: "text/html,application/xhtml+xml",
		},
		redirect: "follow",
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	};
}

async function ensureRobotsAllows(
	fetchImpl: typeof fetch,
	target: URL
): Promise<void> {
	let robotsTxt: string | null = null;
	try {
		const response = await fetchImpl(
			`${target.origin}/robots.txt`,
			buildRequestInit()
		);
		if (response.ok) {
			robotsTxt = await readBodyCapped(response, MAX_IMPORT_PAGE_BYTES);
		}
	} catch {
		// Unreachable or oversized robots.txt — treat as no restrictions.
	}
	if (
		robotsTxt !== null &&
		!isPathAllowedByRobots(robotsTxt, target.pathname + target.search)
	) {
		throw new Error(ROBOTS_BLOCKED_MESSAGE);
	}
}

async function readBodyCapped(
	response: Response,
	maxBytes: number
): Promise<string> {
	const declaredLength = Number(response.headers.get("content-length"));
	if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
		throw new Error(TOO_LARGE_MESSAGE);
	}
	if (!response.body) {
		const text = await response.text();
		if (text.length > maxBytes) throw new Error(TOO_LARGE_MESSAGE);
		return text;
	}
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > maxBytes) {
			await reader.cancel();
			throw new Error(TOO_LARGE_MESSAGE);
		}
		chunks.push(value);
	}
	const merged = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		merged.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(merged);
}

type Dimensions = Pick<
	ProductExtractionCandidate,
	"widthCm" | "heightCm" | "depthCm"
>;

function hasAllDimensions(candidate: Dimensions): boolean {
	return (
		candidate.widthCm !== null &&
		candidate.heightCm !== null &&
		candidate.depthCm !== null
	);
}

/** Fill only the still-blank axes of `candidate` from `source`. */
function mergeDimensions(
	candidate: ProductExtractionCandidate,
	source: Dimensions
): ProductExtractionCandidate {
	return {
		...candidate,
		widthCm: candidate.widthCm ?? source.widthCm,
		heightCm: candidate.heightCm ?? source.heightCm,
		depthCm: candidate.depthCm ?? source.depthCm,
	};
}

/**
 * Fill any dimension the structured extraction left blank. Order of precedence:
 * JSON-LD (already on the candidate) → a deterministic, network-free parse of
 * labeled cm/mm dimensions in the page text → an AI pass for whatever remains.
 * Each step only fills nulls, and the AI step is best-effort: a provider
 * failure leaves the blanks untouched and never blocks the import.
 */
async function fillMissingDimensions(args: {
	candidate: ProductExtractionCandidate;
	html: string;
	aiProvider: RenovationAiProvider;
}): Promise<ProductExtractionCandidate> {
	if (hasAllDimensions(args.candidate)) return args.candidate;

	const pageText = stripHtmlToText(args.html);
	const candidate = mergeDimensions(
		args.candidate,
		parseDimensionsFromText(pageText)
	);
	if (hasAllDimensions(candidate)) return candidate;

	try {
		const { value } = await args.aiProvider.extractFurnitureDimensions({
			pageText,
			productName: candidate.name,
		});
		return mergeDimensions(candidate, value);
	} catch {
		return candidate;
	}
}

/** @internal */
export async function __extractFurnitureCandidateHandler(args: {
	input: ExtractFurnitureCandidateInput;
	fetchImpl?: typeof fetch;
	aiProvider?: RenovationAiProvider;
}): Promise<{ sourceUrl: string; candidate: ProductExtractionCandidate }> {
	const fetchImpl = args.fetchImpl ?? fetch;
	const target = parsePublicHttpUrl(args.input.url);

	await ensureRobotsAllows(fetchImpl, target);

	let response: Response;
	try {
		response = await fetchImpl(target.href, buildRequestInit());
	} catch {
		throw new Error(UNREACHABLE_MESSAGE);
	}
	if (!response.ok) {
		throw new Error(httpStatusMessage(response.status));
	}
	const html = await readBodyCapped(response, MAX_IMPORT_PAGE_BYTES);

	// Resolve relative photo URLs against the post-redirect URL when known.
	const pageUrl = response.url || target.href;
	const candidate = await fillMissingDimensions({
		candidate: extractProductCandidate(html, pageUrl),
		html,
		aiProvider: args.aiProvider ?? getRenovationAiProvider(),
	});
	return {
		sourceUrl: args.input.url,
		candidate,
	};
}

export const extractFurnitureCandidate = createServerFn({ method: "POST" })
	.validator(extractFurnitureCandidateSchema)
	.handler(async ({ data }) => {
		await requireAuthedSupabase(
			readBearerToken(getRequestHeader("authorization"))
		);
		return __extractFurnitureCandidateHandler({ input: data });
	});

function buildImageRequestInit(): RequestInit {
	return {
		headers: {
			"User-Agent": FURNITURE_IMPORT_USER_AGENT,
			Accept: "image/avif,image/webp,image/png,image/jpeg,*/*",
		},
		redirect: "follow",
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	};
}

/** Read a binary response body into a Buffer, aborting past `maxBytes`. */
async function readBytesCapped(
	response: Response,
	maxBytes: number
): Promise<Buffer> {
	const declaredLength = Number(response.headers.get("content-length"));
	if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
		throw new Error(IMAGE_INVALID_MESSAGE);
	}
	const buffer = Buffer.from(await response.arrayBuffer());
	if (buffer.byteLength > maxBytes) {
		throw new Error(IMAGE_INVALID_MESSAGE);
	}
	return buffer;
}

/**
 * Download one extracted photo, normalise it to a clean PNG (Renderia stores
 * its own copy — never hotlinks), and upload it to the furniture bucket.
 * Reuses the page fetch's hygiene (honest UA, public hosts only, size cap).
 * Returns the stored path and a safe original name.
 */
async function downloadAndStorePhoto(args: {
	fetchImpl: typeof fetch;
	supabase: SupabaseClient<Database>;
	userId: string;
	photo: URL;
}): Promise<{ storagePath: string; originalName: string }> {
	let response: Response;
	try {
		response = await args.fetchImpl(args.photo.href, buildImageRequestInit());
	} catch {
		throw new Error(IMAGE_UNREACHABLE_MESSAGE);
	}
	if (!response.ok) {
		throw new Error(IMAGE_UNREACHABLE_MESSAGE);
	}
	const downloaded = await readBytesCapped(response, MAX_IMPORT_IMAGE_BYTES);

	// Re-encode to a clean sRGB PNG; fall back to the raw bytes if the encoder
	// can't decode them (the upload still happens, just unnormalised).
	const normalized = (await normalizeImageToPng(downloaded)) ?? downloaded;

	const storagePath = `${args.userId}/${Date.now()}-${crypto
		.randomUUID()
		.slice(0, 8)}.png`;
	const upload = await args.supabase.storage
		.from(FURNITURE_BUCKET)
		.upload(storagePath, normalized, {
			contentType: "image/png",
			upsert: false,
		});
	if (upload.error) {
		throw new Error(IMAGE_INVALID_MESSAGE);
	}
	return { storagePath, originalName: importedFilename(args.photo) };
}

/**
 * Link Import confirm half: download every photo the user chose to keep,
 * store each as a clean PNG in the furniture bucket, and insert the item with
 * one `furniture_item_images` row per photo — exactly one active (the user's
 * picked Reference Image). The other kept photos join the item's gallery.
 */
/** @internal */
export async function __importFurnitureItemHandler(args: {
	userId: string;
	supabase: SupabaseClient<Database>;
	input: ImportFurnitureItemInput;
	fetchImpl?: typeof fetch;
}): Promise<{ id: string }> {
	const fetchImpl = args.fetchImpl ?? fetch;
	// Parse every kept photo up front so a non-public URL is rejected before any
	// download or storage write happens.
	const photos = args.input.photoUrls.map((url) => parsePublicHttpUrl(url));
	const activeIndex = args.input.activePhotoIndex;

	// Download and store each kept photo (sequentially — keeps the request
	// gentle on the retailer and storage paths distinct).
	const stored: { storagePath: string; originalName: string }[] = [];
	for (const photo of photos) {
		stored.push(
			await downloadAndStorePhoto({
				fetchImpl,
				supabase: args.supabase,
				userId: args.userId,
				photo,
			})
		);
	}

	// Create the parent item with the picked photo as its active Reference Image.
	const active = stored[activeIndex];
	const created = await __createFurnitureItemHandler({
		userId: args.userId,
		supabase: args.supabase,
		input: {
			storagePath: active.storagePath,
			originalName: active.originalName,
			contentType: "image/png",
			label: args.input.label,
			source: "product",
			sourceLink: args.input.sourceUrl,
			brand: args.input.brand ?? null,
			price: args.input.price ?? null,
			currency: args.input.currency ?? null,
			widthCm: args.input.widthCm ?? null,
			heightCm: args.input.heightCm ?? null,
			depthCm: args.input.depthCm ?? null,
		},
	});

	// The remaining kept photos become inactive gallery rows on the same item.
	const others = stored.filter((_, index) => index !== activeIndex);
	if (others.length > 0) {
		const inserted = await args.supabase.from("furniture_item_images").insert(
			others.map((photo) => ({
				furniture_item_id: String(created.id),
				owner_id: args.userId,
				storage_path: photo.storagePath,
				original_name: photo.originalName,
				content_type: "image/png",
				source: "product" as const,
				is_active: false,
			}))
		);
		if (inserted.error) throw wrapSupabaseError(inserted.error);
	}
	return { id: String(created.id) };
}

/** Safe `original_name` derived from the photo URL's basename. */
function importedFilename(photo: URL): string {
	const base = photo.pathname.split("/").pop() ?? "";
	const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "");
	return cleaned.length > 0 ? cleaned.slice(0, 255) : "imported-product.png";
}

export const importFurnitureItem = createServerFn({ method: "POST" })
	.validator(importFurnitureItemSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(
			readBearerToken(getRequestHeader("authorization"))
		);
		return __importFurnitureItemHandler({ userId, supabase, input: data });
	});
