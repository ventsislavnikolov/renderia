import { z } from "zod";

/**
 * Shared Zod schemas for renovation server functions and tests.
 *
 * Each schema mirrors the database column constraints from
 * `supabase/migrations/0001_initial_schema.sql`. Keeping them centralised
 * means request validation and downstream tests reference the same shapes.
 *
 * String length caps are conservative defaults — they exist to keep
 * malformed or hostile payloads from reaching the database or the AI
 * provider, not to lock in product limits. Adjust per-column as the schema
 * evolves.
 */

export const createProjectSchema = z.object({
	name: z.string().min(1).max(200),
	description: z.string().max(2000).optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const getProjectSchema = z.object({
	projectId: z.string().uuid(),
});
export type GetProjectInput = z.infer<typeof getProjectSchema>;

export const createTaskSchema = z.object({
	projectId: z.string().uuid(),
	title: z.string().min(1).max(200),
	category: z.string().min(1).max(200),
	notes: z.string().max(4000).optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const listTasksSchema = z.object({
	projectId: z.string().uuid(),
});
export type ListTasksInput = z.infer<typeof listTasksSchema>;

/**
 * Bounding box for a protected element. Coordinates and dimensions are
 * normalised to the 0..1 range relative to the photo so we can render the
 * same overlay across image sizes without re-running detection.
 */
export const protectedElementSchema = z.object({
	label: z.string().min(1).max(200),
	kind: z.enum([
		"window",
		"door",
		"stairs",
		"ceiling_line",
		"wall_edge",
		"structure",
		"other",
	]),
	x: z.number().min(0).max(1),
	y: z.number().min(0).max(1),
	width: z.number().min(0).max(1),
	height: z.number().min(0).max(1),
	confidence: z.number().optional(),
});
export type ProtectedElementInput = z.infer<typeof protectedElementSchema>;

export const createPhotoSchema = z.object({
	projectId: z.string().uuid(),
	// `user-id/filename` pattern — first segment is the owning user's UUID,
	// second segment is a safe filename. Rejects `..`, leading `/`, or any
	// other path-traversal shape that storage bucket policies wouldn't catch.
	storagePath: z
		.string()
		.min(1)
		.max(512)
		.regex(/^[a-f0-9-]+\/[A-Za-z0-9._-]+$/),
	originalName: z.string().min(1).max(255),
	contentType: z.string().regex(/^image\/(png|jpeg|webp)$/),
	notes: z.string().max(4000).optional(),
});
export type CreatePhotoInput = z.infer<typeof createPhotoSchema>;

export const listPhotosSchema = z.object({
	projectId: z.string().uuid(),
});
export type ListPhotosInput = z.infer<typeof listPhotosSchema>;

export const suggestTasksSchema = z.object({
	projectId: z.string().uuid(),
	projectNotes: z.string().max(4000).default(""),
});
export type SuggestTasksInput = z.infer<typeof suggestTasksSchema>;

export const detectProtectedElementsSchema = z.object({
	photoUrl: z.string().url(),
	taskTitle: z.string().min(1).max(200),
	notes: z.string().max(4000).optional(),
});
export type DetectProtectedElementsInput = z.infer<
	typeof detectProtectedElementsSchema
>;

export const createDesignBriefSchema = z.object({
	taskTitle: z.string().min(1).max(200),
	styleRules: z.string().min(1).max(4000),
	protectedElements: z.array(protectedElementSchema),
});
export type CreateDesignBriefInput = z.infer<typeof createDesignBriefSchema>;
