import { describe, expect, it } from "vitest";
import {
	allPreviewsApproved,
	buildInitialRoomState,
	clampAppearanceBox,
	getAllProtectedElements,
	getReferenceProtectedElements,
	invalidatePreview,
	pickReferencePhotoId,
	type RoomAppearance,
	setPhotoPreviewApproved,
	suggestRoomObjects,
} from "../../../src/lib/renovation/room-state";

function appearance(
	overrides: Partial<RoomAppearance> & Pick<RoomAppearance, "id" | "photoId">
): RoomAppearance {
	return {
		id: overrides.id,
		photoId: overrides.photoId,
		label: overrides.label ?? "main door",
		kind: overrides.kind ?? "door",
		x: overrides.x ?? 0.1,
		y: overrides.y ?? 0.2,
		width: overrides.width ?? 0.15,
		height: overrides.height ?? 0.3,
		confidence: overrides.confidence ?? 0.9,
		source: overrides.source ?? "ai",
		objectId: overrides.objectId ?? null,
	};
}

describe("clampAppearanceBox", () => {
	it("keeps an in-bounds box unchanged", () => {
		expect(
			clampAppearanceBox({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 })
		).toStrictEqual({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
	});

	it("shrinks a box that hangs past the right and bottom edges", () => {
		const clamped = clampAppearanceBox({
			x: 0.9,
			y: 0.9,
			width: 0.3,
			height: 0.3,
		});
		expect(clamped.x + clamped.width).toBeLessThanOrEqual(1);
		expect(clamped.y + clamped.height).toBeLessThanOrEqual(1);
	});

	it("forces degenerate and negative values into the unit square", () => {
		const clamped = clampAppearanceBox({
			x: -0.2,
			y: 1.4,
			width: 0,
			height: -1,
		});
		expect(clamped.x).toBeGreaterThanOrEqual(0);
		expect(clamped.y).toBeLessThan(1);
		expect(clamped.width).toBeGreaterThan(0);
		expect(clamped.height).toBeGreaterThan(0);
		expect(clamped.x + clamped.width).toBeLessThanOrEqual(1);
		expect(clamped.y + clamped.height).toBeLessThanOrEqual(1);
	});
});

describe("room-state helpers", () => {
	it("builds an initial state for a 1-4 photo room set", () => {
		expect(buildInitialRoomState(["p1", "p2", "p3"]).photoIds).toStrictEqual([
			"p1",
			"p2",
			"p3",
		]);
		expect(() => buildInitialRoomState([])).toThrow(/1 to 4 photos/i);
		expect(() => buildInitialRoomState(["a", "b", "c", "d", "e"])).toThrow(
			/1 to 4 photos/i
		);
	});

	it("builds an initial state with no approved photo previews", () => {
		expect(buildInitialRoomState(["p1", "p2"]).approvedPhotoIds).toStrictEqual(
			[]
		);
	});

	it("treats the room set as fully approved only when every kept photo is approved", () => {
		const state = buildInitialRoomState(["p1", "p2"]);
		expect(allPreviewsApproved(state)).toBe(false);

		const partial = setPhotoPreviewApproved(state, "p1", true);
		expect(partial.approvedPhotoIds).toStrictEqual(["p1"]);
		expect(allPreviewsApproved(partial)).toBe(false);

		const full = setPhotoPreviewApproved(partial, "p2", true);
		expect(allPreviewsApproved(full)).toBe(true);
	});

	it("never reports an empty room set as approved", () => {
		expect(allPreviewsApproved(buildInitialRoomState(["p1"]))).toBe(false);
	});

	it("does not double-add a photo already approved and can revoke approval", () => {
		const once = setPhotoPreviewApproved(
			buildInitialRoomState(["p1"]),
			"p1",
			true
		);
		const twice = setPhotoPreviewApproved(once, "p1", true);
		expect(twice.approvedPhotoIds).toStrictEqual(["p1"]);
		expect(
			setPhotoPreviewApproved(twice, "p1", false).approvedPhotoIds
		).toStrictEqual([]);
	});

	it("invalidating a preview clears every photo approval", () => {
		const approved = setPhotoPreviewApproved(
			buildInitialRoomState(["p1", "p2"]),
			"p1",
			true
		);
		expect(invalidatePreview(approved).approvedPhotoIds).toStrictEqual([]);
	});

	it("auto-suggests canonical room objects by kind + normalized label", () => {
		const objects = suggestRoomObjects([
			appearance({ id: "a1", photoId: "p1", label: "Main Door" }),
			appearance({ id: "a2", photoId: "p2", label: "main door " }),
			appearance({
				id: "a3",
				photoId: "p2",
				label: "Left Window",
				kind: "window",
			}),
		]);

		expect(objects).toHaveLength(2);
		expect(objects[0]?.appearanceIds).toHaveLength(2);
		expect(objects[0]?.kind).toBe("door");
		expect(objects[0]?.preservationMode).toBe("exact_preserve");
		expect(objects[1]?.kind).toBe("window");
	});

	it("prefers the reviewed photo with the most persisted-object evidence as reference", () => {
		const state = buildInitialRoomState(["p1", "p2", "p3"]);
		state.reviewedPhotoIds = ["p1", "p2"];
		state.appearances = [
			appearance({ id: "a1", photoId: "p1", objectId: "o1" }),
			appearance({ id: "a2", photoId: "p2", objectId: "o1" }),
			appearance({
				id: "a3",
				photoId: "p2",
				objectId: "o2",
				label: "left window",
				kind: "window",
			}),
		];
		state.objects = [
			{
				id: "o1",
				label: "main door",
				kind: "door",
				preservationMode: "exact_preserve",
				appearanceIds: ["a1", "a2"],
				isPersisted: true,
			},
			{
				id: "o2",
				label: "left window",
				kind: "window",
				preservationMode: "keep_type_restyle",
				appearanceIds: ["a3"],
				isPersisted: true,
			},
		];

		expect(pickReferencePhotoId(state)).toBe("p2");
	});

	it("projects only persisted reference-photo objects into legacy protected elements", () => {
		const state = buildInitialRoomState(["p1", "p2"]);
		state.referencePhotoId = "p2";
		state.appearances = [
			appearance({ id: "a1", photoId: "p1", objectId: "o1" }),
			appearance({ id: "a2", photoId: "p2", objectId: "o1" }),
			appearance({
				id: "a3",
				photoId: "p2",
				objectId: "o2",
				label: "hall radiator",
				kind: "radiator",
			}),
		];
		state.objects = [
			{
				id: "o1",
				label: "main door",
				kind: "door",
				preservationMode: "exact_preserve",
				appearanceIds: ["a1", "a2"],
				isPersisted: true,
			},
			{
				id: "o2",
				label: "hall radiator",
				kind: "radiator",
				preservationMode: "keep_type_restyle",
				appearanceIds: ["a3"],
				isPersisted: false,
			},
		];

		expect(getReferenceProtectedElements(state)).toStrictEqual([
			expect.objectContaining({
				label: "main door",
				kind: "door",
				x: 0.1,
				y: 0.2,
				width: 0.15,
				height: 0.3,
			}),
		]);
	});

	it("collects persisted protected elements across all photos, deduped per object", () => {
		const state = buildInitialRoomState(["p1", "p2"]);
		state.appearances = [
			// Same persisted object seen from two angles → one entry (first wins).
			appearance({ id: "a1", photoId: "p1", objectId: "o1" }),
			appearance({ id: "a2", photoId: "p2", objectId: "o1" }),
			// A persisted object only visible in p2 → still included.
			appearance({
				id: "a3",
				photoId: "p2",
				objectId: "o2",
				label: "left window",
				kind: "window",
			}),
			// A non-persisted object → excluded.
			appearance({
				id: "a4",
				photoId: "p1",
				objectId: "o3",
				label: "hall radiator",
				kind: "radiator",
			}),
		];
		state.objects = [
			{
				id: "o1",
				label: "main door",
				kind: "door",
				preservationMode: "exact_preserve",
				appearanceIds: ["a1", "a2"],
				isPersisted: true,
			},
			{
				id: "o2",
				label: "left window",
				kind: "window",
				preservationMode: "keep_type_restyle",
				appearanceIds: ["a3"],
				isPersisted: true,
			},
			{
				id: "o3",
				label: "hall radiator",
				kind: "radiator",
				preservationMode: "exact_preserve",
				appearanceIds: ["a4"],
				isPersisted: false,
			},
		];

		const elements = getAllProtectedElements(state);
		expect(elements).toHaveLength(2);
		expect(elements.map((entry) => entry.label)).toStrictEqual([
			"main door",
			"left window",
		]);
	});
});
