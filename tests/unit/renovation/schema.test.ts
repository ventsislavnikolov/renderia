import { describe, expect, it } from "vitest";
import {
	createDesignBriefSchema,
	createPhotoSchema,
	createProjectSchema,
	createTaskSchema,
	detectProtectedElementsSchema,
	protectedElementSchema,
	suggestTasksSchema,
} from "../../../src/lib/renovation/schema";

describe("renovation schemas", () => {
	it("rejects empty project names", () => {
		expect(createProjectSchema.safeParse({ name: "" }).success).toBe(false);
		expect(createProjectSchema.safeParse({ name: "City house" }).success).toBe(
			true,
		);
	});

	it("requires projectId to be a uuid for createTask", () => {
		expect(
			createTaskSchema.safeParse({
				projectId: "not-a-uuid",
				title: "t",
				category: "ceiling",
			}).success,
		).toBe(false);
	});

	it("requires a uuid for createPhoto.projectId", () => {
		const ok = createPhotoSchema.safeParse({
			projectId: "11111111-1111-4111-8111-111111111111",
			storagePath: "11111111-1111-4111-8111-111111111111/photo.png",
			originalName: "photo.png",
			contentType: "image/png",
		});
		expect(ok.success).toBe(true);
	});

	it("rejects storagePath shapes that allow traversal", () => {
		const inputs = [
			"../etc/passwd",
			"/leading-slash/file.png",
			"11111111-1111-4111-8111-111111111111/../escape.png",
			"BAD-USER-ID/file.png", // not hex
		];
		for (const storagePath of inputs) {
			expect(
				createPhotoSchema.safeParse({
					projectId: "11111111-1111-4111-8111-111111111111",
					storagePath,
					originalName: "photo.png",
					contentType: "image/png",
				}).success,
			).toBe(false);
		}
	});

	it("restricts photo contentType to safe image mime types", () => {
		const base = {
			projectId: "11111111-1111-4111-8111-111111111111",
			storagePath: "11111111-1111-4111-8111-111111111111/photo.png",
			originalName: "photo.png",
		};
		expect(
			createPhotoSchema.safeParse({ ...base, contentType: "image/jpeg" })
				.success,
		).toBe(true);
		expect(
			createPhotoSchema.safeParse({ ...base, contentType: "image/webp" })
				.success,
		).toBe(true);
		expect(
			createPhotoSchema.safeParse({
				...base,
				contentType: "application/octet-stream",
			}).success,
		).toBe(false);
		expect(
			createPhotoSchema.safeParse({ ...base, contentType: "image/gif" })
				.success,
		).toBe(false);
	});

	it("clamps protected element coordinates to 0..1", () => {
		const bad = protectedElementSchema.safeParse({
			label: "window",
			kind: "window",
			x: 1.2,
			y: 0,
			width: 0.1,
			height: 0.1,
		});
		expect(bad.success).toBe(false);
	});

	it("rejects disallowed protected element kinds", () => {
		const bad = protectedElementSchema.safeParse({
			label: "banana",
			kind: "banana",
			x: 0,
			y: 0,
			width: 0.1,
			height: 0.1,
		});
		expect(bad.success).toBe(false);
	});

	it("defaults suggestTasks projectNotes to empty string", () => {
		const parsed = suggestTasksSchema.parse({
			projectId: "11111111-1111-4111-8111-111111111111",
		});
		expect(parsed.projectNotes).toBe("");
	});

	it("requires a URL for detect photoUrl", () => {
		expect(
			detectProtectedElementsSchema.safeParse({
				photoUrl: "not a url",
				taskTitle: "kitchen",
			}).success,
		).toBe(false);
		expect(
			detectProtectedElementsSchema.safeParse({
				photoUrl: "https://example/p",
				taskTitle: "kitchen",
			}).success,
		).toBe(true);
	});

	it("requires non-empty styleRules for design brief", () => {
		expect(
			createDesignBriefSchema.safeParse({
				taskTitle: "t",
				styleRules: "",
				protectedElements: [],
			}).success,
		).toBe(false);
	});
});
