import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import {
	type CreateFurnitureItemInput,
	createFurnitureItemSchema,
	type DeleteFurnitureItemInput,
	deleteFurnitureItemSchema,
	type ListFurnitureItemsInput,
	listFurnitureItemsSchema,
	type SetTaskFurnitureInput,
	setTaskFurnitureSchema,
	type UpdateFurnitureItemInput,
	updateFurnitureItemSchema,
} from "../lib/renovation/schema";
import {
	readBearerToken,
	requireAuthedSupabase,
	wrapSupabaseError,
} from "../lib/supabase/server";
import type { Database } from "../lib/types/database";

/**
 * Server functions for the account-wide Furniture Library. Items belong to
 * the owner only — any item is a candidate for any task's generation run.
 *
 * Image bytes are uploaded directly from the browser to the
 * `furniture-references` bucket (same flow as source photos); these fns only
 * manage the metadata rows and the per-task selection that feeds generation.
 */

type SupabaseScoped = SupabaseClient<Database>;
const SIGNED_URL_TTL_SECONDS = 600;

export type FurnitureItemPayload = {
	id: string;
	label: string;
	source: "product" | "photo";
	originalName: string;
	signedUrl: string | null;
	selected: boolean;
	createdAt: string;
	/** Link-Import metadata; null on manually-added items. */
	sourceLink: string | null;
	brand: string | null;
	price: number | null;
	currency: string | null;
	widthCm: number | null;
	heightCm: number | null;
	depthCm: number | null;
};

/**
 * PostgREST can return `numeric` columns as strings to preserve precision, so
 * normalise every numeric metadata field to a finite number (or null).
 */
function toFiniteNumberOrNull(value: unknown): number | null {
	if (value === null || value === undefined) return null;
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function toTrimmedStringOrNull(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

/** @internal */
export async function __createFurnitureItemHandler(args: {
	userId: string;
	supabase: SupabaseScoped;
	input: CreateFurnitureItemInput;
}) {
	const { data, error } = await args.supabase
		.from("furniture_items")
		.insert({
			owner_id: args.userId,
			storage_path: args.input.storagePath,
			original_name: args.input.originalName,
			content_type: args.input.contentType,
			label: args.input.label,
			source: args.input.source,
			source_link: args.input.sourceLink ?? null,
			brand: args.input.brand ?? null,
			price: args.input.price ?? null,
			currency: args.input.currency ?? null,
			width_cm: args.input.widthCm ?? null,
			height_cm: args.input.heightCm ?? null,
			depth_cm: args.input.depthCm ?? null,
		})
		.select()
		.single();
	if (error) throw wrapSupabaseError(error);
	return data;
}

/** @internal */
export async function __listFurnitureItemsHandler(args: {
	userId: string;
	supabase: SupabaseScoped;
	input: ListFurnitureItemsInput;
}): Promise<{ items: FurnitureItemPayload[] }> {
	const rows = await args.supabase
		.from("furniture_items")
		.select(
			"id, label, source, original_name, storage_bucket, storage_path, created_at, source_link, brand, price, currency, width_cm, height_cm, depth_cm"
		)
		.eq("owner_id", args.userId)
		.order("created_at", { ascending: true });
	if (rows.error) throw wrapSupabaseError(rows.error);

	const selectedIds = new Set<string>();
	if (args.input.taskId) {
		const links = await args.supabase
			.from("task_furniture")
			.select("furniture_item_id")
			.eq("owner_id", args.userId)
			.eq("task_id", args.input.taskId);
		if (links.error) throw wrapSupabaseError(links.error);
		for (const link of links.data ?? []) {
			selectedIds.add(String(link.furniture_item_id));
		}
	}

	const items: FurnitureItemPayload[] = [];
	for (const row of rows.data ?? []) {
		const signed = await args.supabase.storage
			.from(String(row.storage_bucket))
			.createSignedUrl(String(row.storage_path), SIGNED_URL_TTL_SECONDS);
		items.push({
			id: String(row.id),
			label: String(row.label),
			source: row.source as "product" | "photo",
			originalName: String(row.original_name),
			signedUrl: signed.data?.signedUrl ?? null,
			selected: selectedIds.has(String(row.id)),
			createdAt: String(row.created_at),
			sourceLink: toTrimmedStringOrNull(row.source_link),
			brand: toTrimmedStringOrNull(row.brand),
			price: toFiniteNumberOrNull(row.price),
			currency: toTrimmedStringOrNull(row.currency),
			widthCm: toFiniteNumberOrNull(row.width_cm),
			heightCm: toFiniteNumberOrNull(row.height_cm),
			depthCm: toFiniteNumberOrNull(row.depth_cm),
		});
	}
	return { items };
}

/** @internal */
export async function __updateFurnitureItemHandler(args: {
	userId: string;
	supabase: SupabaseScoped;
	input: UpdateFurnitureItemInput;
}) {
	const { data, error } = await args.supabase
		.from("furniture_items")
		.update({
			label: args.input.label,
			width_cm: args.input.widthCm,
			height_cm: args.input.heightCm,
			depth_cm: args.input.depthCm,
		})
		.eq("id", args.input.furnitureItemId)
		.eq("owner_id", args.userId)
		.select()
		.single();
	if (error) throw wrapSupabaseError(error);
	if (!data) throw new Error("Furniture item not found");
	return data;
}

/** @internal */
export async function __deleteFurnitureItemHandler(args: {
	userId: string;
	supabase: SupabaseScoped;
	input: DeleteFurnitureItemInput;
}) {
	const item = await args.supabase
		.from("furniture_items")
		.select("storage_bucket, storage_path")
		.eq("id", args.input.furnitureItemId)
		.eq("owner_id", args.userId)
		.maybeSingle();
	if (item.error) throw wrapSupabaseError(item.error);
	if (!item.data) throw new Error("Furniture item not found");

	// Row delete cascades to task_furniture links.
	const deleted = await args.supabase
		.from("furniture_items")
		.delete()
		.eq("id", args.input.furnitureItemId)
		.eq("owner_id", args.userId);
	if (deleted.error) throw wrapSupabaseError(deleted.error);

	// Best-effort storage cleanup — an orphaned object never blocks the user.
	const removal = await args.supabase.storage
		.from(item.data.storage_bucket)
		.remove([item.data.storage_path]);
	if (removal.error) {
		console.error("Failed to remove storage object", removal.error.message);
	}
}

/** @internal */
export async function __setTaskFurnitureHandler(args: {
	userId: string;
	supabase: SupabaseScoped;
	input: SetTaskFurnitureInput;
}) {
	const task = await args.supabase
		.from("renovation_tasks")
		.select("id, project_id")
		.eq("id", args.input.taskId)
		.eq("owner_id", args.userId)
		.maybeSingle();
	if (task.error) throw wrapSupabaseError(task.error);
	if (!task.data) throw new Error("Task not found");
	const projectId = task.data.project_id;

	const cleared = await args.supabase
		.from("task_furniture")
		.delete()
		.eq("task_id", args.input.taskId)
		.eq("owner_id", args.userId);
	if (cleared.error) throw wrapSupabaseError(cleared.error);

	if (args.input.furnitureItemIds.length > 0) {
		const inserted = await args.supabase.from("task_furniture").insert(
			args.input.furnitureItemIds.map((furnitureItemId) => ({
				owner_id: args.userId,
				project_id: projectId,
				task_id: args.input.taskId,
				furniture_item_id: furnitureItemId,
			}))
		);
		if (inserted.error) throw wrapSupabaseError(inserted.error);
	}
	return { ok: true };
}

function readAuthToken(): string | undefined {
	return readBearerToken(getRequestHeader("authorization"));
}

export const createFurnitureItem = createServerFn({ method: "POST" })
	.validator(createFurnitureItemSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __createFurnitureItemHandler({ userId, supabase, input: data });
	});

export const listFurnitureItems = createServerFn({ method: "POST" })
	.validator(listFurnitureItemsSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __listFurnitureItemsHandler({ userId, supabase, input: data });
	});

export const updateFurnitureItem = createServerFn({ method: "POST" })
	.validator(updateFurnitureItemSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __updateFurnitureItemHandler({ userId, supabase, input: data });
	});

export const deleteFurnitureItem = createServerFn({ method: "POST" })
	.validator(deleteFurnitureItemSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __deleteFurnitureItemHandler({ userId, supabase, input: data });
	});

export const setTaskFurniture = createServerFn({ method: "POST" })
	.validator(setTaskFurnitureSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __setTaskFurnitureHandler({ userId, supabase, input: data });
	});
