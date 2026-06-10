import { describe, expect, it } from "vitest";
import {
	buildInitialRoomState,
	clampAppearanceBox,
	getReferenceProtectedElements,
	pickReferencePhotoId,
	type RoomAppearance,
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
});
