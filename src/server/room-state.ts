import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { buildStructuralPreviewPrompt } from "../lib/ai/prompts";
import { getRenovationAiProvider } from "../lib/ai/provider";
import type { RenovationAiProvider } from "../lib/ai/types";
import {
	clampAppearanceBox,
	type TaskRoomState,
} from "../lib/renovation/room-state";
import {
	type ApproveStructuralPreviewInput,
	approveStructuralPreviewSchema,
	type CreateStructuralPreviewInput,
	createStructuralPreviewSchema,
	type LoadTaskRoomStateInput,
	loadTaskRoomStateSchema,
	type SaveTaskRoomStateInput,
	saveTaskRoomStateSchema,
} from "../lib/renovation/schema";
import {
	readBearerToken,
	requireAuthedSupabase,
	wrapSupabaseError,
} from "../lib/supabase/server";
import type { Database, Tables } from "../lib/types/database";
import { normalizeImageToPng } from "./image-normalize";

type SupabaseScoped = SupabaseClient<Database>;
const PREVIEW_BUCKET = "structural-previews" as const;
const SIGNED_URL_TTL_SECONDS = 600;
const EDITABLE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

type StructuralPreviewPayload = {
	id: string;
	storagePath: string;
	signedUrl: string;
	status: string;
	referencePhotoId: string;
};

async function requireOwnedTask(args: {
	supabase: SupabaseScoped;
	userId: string;
	taskId: string;
}) {
	const result = await args.supabase
		.from("renovation_tasks")
		.select("id, project_id")
		.eq("id", args.taskId)
		.eq("owner_id", args.userId)
		.maybeSingle();
	if (result.error) throw wrapSupabaseError(result.error);
	if (!result.data) throw new Error("Task not found");
	return result.data;
}

async function loadSourcePhoto(args: {
	supabase: SupabaseScoped;
	userId: string;
	photoId: string;
}) {
	const row = await args.supabase
		.from("photos")
		.select("storage_bucket, storage_path, content_type, original_name")
		.eq("id", args.photoId)
		.eq("owner_id", args.userId)
		.maybeSingle();
	if (row.error || !row.data) return;

	const download = await args.supabase.storage
		.from(row.data.storage_bucket)
		.download(row.data.storage_path);
	if (download.error || !download.data) return;

	const buffer = Buffer.from(await download.data.arrayBuffer());
	const normalized = await normalizeImageToPng(buffer);
	if (normalized) {
		return {
			base64: normalized.toString("base64"),
			contentType: "image/png" as const,
			filename: "source.png",
		};
	}

	const contentType = EDITABLE_IMAGE_TYPES.has(row.data.content_type)
		? (row.data.content_type as "image/png" | "image/jpeg" | "image/webp")
		: "image/png";
	return {
		base64: buffer.toString("base64"),
		contentType,
		filename: row.data.original_name || "source.png",
	};
}

async function signPreviewRow(args: {
	supabase: SupabaseScoped;
	row: Tables<"structural_previews">;
}): Promise<StructuralPreviewPayload | null> {
	const signed = await args.supabase.storage
		.from(args.row.storage_bucket)
		.createSignedUrl(args.row.storage_path, SIGNED_URL_TTL_SECONDS);
	if (signed.error || !signed.data?.signedUrl) return null;
	return {
		id: args.row.id,
		storagePath: args.row.storage_path,
		signedUrl: signed.data.signedUrl,
		status: args.row.status,
		referencePhotoId: args.row.reference_photo_id,
	};
}

export async function __loadTaskRoomStateHandler(args: {
	userId: string;
	supabase: SupabaseScoped;
	input: LoadTaskRoomStateInput;
}): Promise<{
	roomState: TaskRoomState;
	/** Latest preview per reference photo angle, keyed by photo id. */
	previews: Record<string, StructuralPreviewPayload>;
}> {
	await requireOwnedTask({
		supabase: args.supabase,
		userId: args.userId,
		taskId: args.input.taskId,
	});

	const roomSet = await args.supabase
		.from("task_room_sets")
		.select("reference_photo_id, preview_approved, active_preview_id")
		.eq("task_id", args.input.taskId)
		.eq("owner_id", args.userId)
		.maybeSingle();
	if (roomSet.error) throw wrapSupabaseError(roomSet.error);

	const taskPhotos = await args.supabase
		.from("task_photos")
		.select("photo_id, display_order, reviewed_at")
		.eq("task_id", args.input.taskId)
		.eq("owner_id", args.userId)
		.order("display_order", { ascending: true });
	if (taskPhotos.error) throw wrapSupabaseError(taskPhotos.error);

	const objects = await args.supabase
		.from("room_objects")
		.select("id, label, kind, preservation_mode, is_persisted")
		.eq("task_id", args.input.taskId)
		.eq("owner_id", args.userId)
		.order("created_at", { ascending: true });
	if (objects.error) throw wrapSupabaseError(objects.error);

	const appearances = await args.supabase
		.from("room_object_appearances")
		.select(
			"id, photo_id, label, kind, x, y, width, height, confidence, source, room_object_id"
		)
		.eq("task_id", args.input.taskId)
		.eq("owner_id", args.userId)
		.order("created_at", { ascending: true });
	if (appearances.error) throw wrapSupabaseError(appearances.error);

	// Newest-first so the first row seen per reference photo is its latest
	// preview; older generations stay in the table as history.
	const previewQuery = await args.supabase
		.from("structural_previews")
		.select(
			"id, storage_bucket, storage_path, status, reference_photo_id, created_at"
		)
		.eq("task_id", args.input.taskId)
		.eq("owner_id", args.userId)
		.order("created_at", { ascending: false });
	if (previewQuery.error) throw wrapSupabaseError(previewQuery.error);

	const previews: Record<string, StructuralPreviewPayload> = {};
	for (const row of previewQuery.data ?? []) {
		const photoId = String(row.reference_photo_id);
		if (previews[photoId]) continue;
		const signed = await signPreviewRow({
			supabase: args.supabase,
			row: row as Tables<"structural_previews">,
		});
		if (signed) previews[photoId] = signed;
	}

	return {
		roomState: {
			photoIds: (taskPhotos.data ?? []).map((row) => String(row.photo_id)),
			reviewedPhotoIds: (taskPhotos.data ?? [])
				.filter((row) => row.reviewed_at !== null)
				.map((row) => String(row.photo_id)),
			referencePhotoId: roomSet.data?.reference_photo_id
				? String(roomSet.data.reference_photo_id)
				: null,
			previewApproved: Boolean(roomSet.data?.preview_approved),
			appearances: (appearances.data ?? []).map((row) => ({
				id: String(row.id),
				photoId: String(row.photo_id),
				label: String(row.label),
				kind: row.kind as TaskRoomState["appearances"][number]["kind"],
				x: Number(row.x),
				y: Number(row.y),
				width: Number(row.width),
				height: Number(row.height),
				confidence: row.confidence === null ? null : Number(row.confidence),
				source: row.source as "ai" | "manual",
				objectId: row.room_object_id ? String(row.room_object_id) : null,
			})),
			objects: (objects.data ?? []).map((row) => ({
				id: String(row.id),
				label: String(row.label),
				kind: row.kind as TaskRoomState["objects"][number]["kind"],
				preservationMode:
					row.preservation_mode as TaskRoomState["objects"][number]["preservationMode"],
				appearanceIds: (appearances.data ?? [])
					.filter((entry) => entry.room_object_id === row.id)
					.map((entry) => String(entry.id)),
				isPersisted: Boolean(row.is_persisted),
			})),
		},
		previews,
	};
}

export async function __saveTaskRoomStateHandler(args: {
	userId: string;
	supabase: SupabaseScoped;
	input: SaveTaskRoomStateInput;
}) {
	const task = await requireOwnedTask({
		supabase: args.supabase,
		userId: args.userId,
		taskId: args.input.taskId,
	});
	const existingRoomSet = await args.supabase
		.from("task_room_sets")
		.select("active_preview_id, preview_approved_at")
		.eq("task_id", args.input.taskId)
		.eq("owner_id", args.userId)
		.maybeSingle();
	if (existingRoomSet.error) throw wrapSupabaseError(existingRoomSet.error);
	const approvedAt = args.input.roomState.previewApproved
		? (existingRoomSet.data?.preview_approved_at ?? new Date().toISOString())
		: null;
	const activePreviewId = args.input.roomState.previewApproved
		? (existingRoomSet.data?.active_preview_id ?? null)
		: null;

	const roomSetUpsert = await args.supabase
		.from("task_room_sets")
		.upsert({
			task_id: args.input.taskId,
			owner_id: args.userId,
			project_id: task.project_id,
			reference_photo_id: args.input.roomState.referencePhotoId,
			preview_approved: args.input.roomState.previewApproved,
			preview_approved_at: approvedAt,
			active_preview_id: activePreviewId,
			updated_at: new Date().toISOString(),
		})
		.select("task_id")
		.single();
	if (roomSetUpsert.error) throw wrapSupabaseError(roomSetUpsert.error);

	if (
		!args.input.roomState.previewApproved &&
		existingRoomSet.data?.active_preview_id
	) {
		const stalePreview = await args.supabase
			.from("structural_previews")
			.update({ status: "superseded" })
			.eq("id", existingRoomSet.data.active_preview_id)
			.eq("task_id", args.input.taskId)
			.eq("owner_id", args.userId);
		if (stalePreview.error) throw wrapSupabaseError(stalePreview.error);
	}

	const taskPhotoDelete = await args.supabase
		.from("task_photos")
		.delete()
		.eq("task_id", args.input.taskId)
		.eq("owner_id", args.userId);
	if (taskPhotoDelete.error) throw wrapSupabaseError(taskPhotoDelete.error);

	if (args.input.roomState.photoIds.length > 0) {
		const taskPhotoInsert = await args.supabase.from("task_photos").upsert(
			args.input.roomState.photoIds.map((photoId, index) => ({
				task_id: args.input.taskId,
				owner_id: args.userId,
				project_id: task.project_id,
				photo_id: photoId,
				display_order: index,
				reviewed_at: args.input.roomState.reviewedPhotoIds.includes(photoId)
					? new Date().toISOString()
					: null,
			}))
		);
		if (taskPhotoInsert.error) throw wrapSupabaseError(taskPhotoInsert.error);
	}

	const appearanceDelete = await args.supabase
		.from("room_object_appearances")
		.delete()
		.eq("task_id", args.input.taskId)
		.eq("owner_id", args.userId);
	if (appearanceDelete.error) throw wrapSupabaseError(appearanceDelete.error);

	const objectDelete = await args.supabase
		.from("room_objects")
		.delete()
		.eq("task_id", args.input.taskId)
		.eq("owner_id", args.userId);
	if (objectDelete.error) throw wrapSupabaseError(objectDelete.error);

	if (args.input.roomState.objects.length > 0) {
		const objectInsert = await args.supabase.from("room_objects").upsert(
			args.input.roomState.objects.map((entry) => ({
				id: entry.id,
				owner_id: args.userId,
				project_id: task.project_id,
				task_id: args.input.taskId,
				label: entry.label,
				kind: entry.kind,
				preservation_mode: entry.preservationMode,
				is_persisted: entry.isPersisted,
			})),
			{ onConflict: "id" }
		);
		if (objectInsert.error) throw wrapSupabaseError(objectInsert.error);
	}

	if (args.input.roomState.appearances.length > 0) {
		const appearanceInsert = await args.supabase
			.from("room_object_appearances")
			.upsert(
				args.input.roomState.appearances.map((entry) => {
					const box = clampAppearanceBox(entry);
					return {
						id: entry.id,
						owner_id: args.userId,
						project_id: task.project_id,
						task_id: args.input.taskId,
						photo_id: entry.photoId,
						room_object_id: entry.objectId,
						label: entry.label,
						kind: entry.kind,
						x: box.x,
						y: box.y,
						width: box.width,
						height: box.height,
						confidence: entry.confidence,
						source: entry.source,
					};
				}),
				{ onConflict: "id" }
			);
		if (appearanceInsert.error) throw wrapSupabaseError(appearanceInsert.error);
	}

	return { ok: true };
}

export async function __generateStructuralPreviewHandler(args: {
	userId: string;
	supabase: SupabaseScoped;
	provider: RenovationAiProvider;
	input: CreateStructuralPreviewInput;
}): Promise<{ preview: StructuralPreviewPayload }> {
	const task = await requireOwnedTask({
		supabase: args.supabase,
		userId: args.userId,
		taskId: args.input.taskId,
	});
	const sourceImage = await loadSourcePhoto({
		supabase: args.supabase,
		userId: args.userId,
		photoId: args.input.referencePhotoId,
	});
	if (!sourceImage) throw new Error("Source photo not found or unavailable");

	const prompt = buildStructuralPreviewPrompt({
		taskTitle: args.input.taskTitle,
		roomObjects: args.input.roomState.objects,
		supportingPhotoCount: args.input.roomState.photoIds.length,
	});
	const providerResult = await args.provider.generateRenovationImages({
		sourceImage,
		prompts: [prompt],
	});
	const image = providerResult.value[0];
	if (!image) throw new Error("Preview generation returned no image");

	const previewId = crypto.randomUUID();
	const storagePath = `${args.userId}/${args.input.taskId}/${previewId}.png`;
	const upload = await args.supabase.storage
		.from(PREVIEW_BUCKET)
		.upload(storagePath, Buffer.from(image.base64, "base64"), {
			contentType: "image/png",
			upsert: false,
		});
	if (upload.error) throw new Error("Failed to upload structural preview");

	const inserted = await args.supabase
		.from("structural_previews")
		.insert({
			id: previewId,
			owner_id: args.userId,
			project_id: task.project_id,
			task_id: args.input.taskId,
			reference_photo_id: args.input.referencePhotoId,
			storage_bucket: PREVIEW_BUCKET,
			storage_path: storagePath,
			prompt,
			room_state_snapshot: args.input.roomState,
			status: "generated",
		})
		.select("id, storage_bucket, storage_path, status, reference_photo_id")
		.single();
	if (inserted.error) throw wrapSupabaseError(inserted.error);

	await args.supabase
		.from("task_room_sets")
		.update({
			reference_photo_id: args.input.referencePhotoId,
			preview_approved: false,
			preview_approved_at: null,
			active_preview_id: null,
			updated_at: new Date().toISOString(),
		})
		.eq("task_id", args.input.taskId)
		.eq("owner_id", args.userId);

	const preview = await signPreviewRow({
		supabase: args.supabase,
		row: inserted.data as Tables<"structural_previews">,
	});
	if (!preview) throw new Error("Failed to mint preview URL");
	return { preview };
}

export async function __approveStructuralPreviewHandler(args: {
	userId: string;
	supabase: SupabaseScoped;
	input: ApproveStructuralPreviewInput;
}) {
	const task = await requireOwnedTask({
		supabase: args.supabase,
		userId: args.userId,
		taskId: args.input.taskId,
	});
	const previewUpdate = await args.supabase
		.from("structural_previews")
		.update({
			status: "approved",
			approved_at: new Date().toISOString(),
		})
		.eq("id", args.input.previewId)
		.eq("task_id", args.input.taskId)
		.eq("owner_id", args.userId)
		.select("id, reference_photo_id")
		.maybeSingle();
	if (previewUpdate.error) throw wrapSupabaseError(previewUpdate.error);
	if (!previewUpdate.data) throw new Error("Preview not found");

	const roomSetUpdate = await args.supabase
		.from("task_room_sets")
		.update({
			reference_photo_id: previewUpdate.data.reference_photo_id,
			preview_approved: true,
			preview_approved_at: new Date().toISOString(),
			active_preview_id: args.input.previewId,
			updated_at: new Date().toISOString(),
		})
		.eq("task_id", args.input.taskId)
		.eq("owner_id", args.userId)
		.select("task_id")
		.maybeSingle();
	if (roomSetUpdate.error) throw wrapSupabaseError(roomSetUpdate.error);
	if (!roomSetUpdate.data) {
		await args.supabase.from("task_room_sets").upsert({
			task_id: args.input.taskId,
			owner_id: args.userId,
			project_id: task.project_id,
			reference_photo_id: previewUpdate.data.reference_photo_id,
			preview_approved: true,
			preview_approved_at: new Date().toISOString(),
			active_preview_id: args.input.previewId,
			updated_at: new Date().toISOString(),
		});
	}

	await args.supabase
		.from("structural_previews")
		.update({ status: "superseded" })
		.eq("task_id", args.input.taskId)
		.eq("owner_id", args.userId);
	await args.supabase
		.from("structural_previews")
		.update({
			status: "approved",
			approved_at: new Date().toISOString(),
		})
		.eq("id", args.input.previewId)
		.eq("task_id", args.input.taskId)
		.eq("owner_id", args.userId);

	return { ok: true };
}

function readAuthToken(): string | undefined {
	return readBearerToken(getRequestHeader("authorization"));
}

export const loadTaskRoomState = createServerFn({ method: "POST" })
	.validator(loadTaskRoomStateSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __loadTaskRoomStateHandler({ userId, supabase, input: data });
	});

export const saveTaskRoomState = createServerFn({ method: "POST" })
	.validator(saveTaskRoomStateSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __saveTaskRoomStateHandler({ userId, supabase, input: data });
	});

export const generateStructuralPreview = createServerFn({ method: "POST" })
	.validator(createStructuralPreviewSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __generateStructuralPreviewHandler({
			userId,
			supabase,
			provider: getRenovationAiProvider(),
			input: data,
		});
	});

export const approveStructuralPreview = createServerFn({ method: "POST" })
	.validator(approveStructuralPreviewSchema)
	.handler(async ({ data }) => {
		const { userId, supabase } = await requireAuthedSupabase(readAuthToken());
		return __approveStructuralPreviewHandler({
			userId,
			supabase,
			input: data,
		});
	});
