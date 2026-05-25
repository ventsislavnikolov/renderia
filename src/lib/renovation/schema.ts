import { z } from "zod";

/**
 * Shared Zod schemas for renovation server functions and tests.
 *
 * Each schema mirrors the database column constraints from
 * `supabase/migrations/0001_initial_schema.sql`. Keeping them centralised
 * means request validation and downstream tests reference the same shapes.
 */

export const createProjectSchema = z.object({
	name: z.string().min(1),
	description: z.string().optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const getProjectSchema = z.object({
	projectId: z.string().uuid(),
});
export type GetProjectInput = z.infer<typeof getProjectSchema>;

export const createTaskSchema = z.object({
	projectId: z.string().uuid(),
	title: z.string().min(1),
	category: z.string().min(1),
	notes: z.string().optional(),
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
	label: z.string().min(1),
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
	storagePath: z.string().min(1),
	originalName: z.string().min(1),
	contentType: z.string().min(1),
	notes: z.string().optional(),
});
export type CreatePhotoInput = z.infer<typeof createPhotoSchema>;

export const listPhotosSchema = z.object({
	projectId: z.string().uuid(),
});
export type ListPhotosInput = z.infer<typeof listPhotosSchema>;

export const suggestTasksSchema = z.object({
	projectId: z.string().uuid(),
	projectNotes: z.string().default(""),
});
export type SuggestTasksInput = z.infer<typeof suggestTasksSchema>;

export const detectProtectedElementsSchema = z.object({
	photoUrl: z.string().url(),
	taskTitle: z.string().min(1),
	notes: z.string().optional(),
});
export type DetectProtectedElementsInput = z.infer<
	typeof detectProtectedElementsSchema
>;

export const createDesignBriefSchema = z.object({
	taskTitle: z.string().min(1),
	styleRules: z.string().min(1),
	protectedElements: z.array(protectedElementSchema),
});
export type CreateDesignBriefInput = z.infer<typeof createDesignBriefSchema>;
