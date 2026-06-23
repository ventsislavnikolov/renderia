import { describe, expect, it } from "vitest";
import {
	DEFAULT_IMAGE_MODEL,
	DEFAULT_TEXT_MODEL,
	findModel,
	MODEL_CATALOG,
	modelsForKind,
} from "../../../src/lib/ai/models";

const REMOVED_IDS = ["gemini-2.5-flash", "gemini-2.0-flash", "glm-4v-plus"];
const TEXT_ONLY_IDS = ["glm-4.5", "glm-4.5-air", "kimi-k2-0905-preview"];

describe("MODEL_CATALOG", () => {
	it("defaults text to Gemini 3.5 Flash and it resolves in the catalogue", () => {
		expect(DEFAULT_TEXT_MODEL).toEqual({
			provider: "google",
			model: "gemini-3.5-flash",
		});
		expect(findModel(DEFAULT_TEXT_MODEL)).toBeDefined();
	});

	it("defaults image to a catalogued model", () => {
		expect(findModel(DEFAULT_IMAGE_MODEL)).toBeDefined();
		expect(findModel(DEFAULT_IMAGE_MODEL)?.kinds).toContain("image");
	});

	it("drops the dead / deprecated model ids", () => {
		const ids = MODEL_CATALOG.map((entry) => entry.id);
		for (const removed of REMOVED_IDS) {
			expect(ids).not.toContain(removed);
		}
	});

	it("adds the Gemini 3.x replacements", () => {
		const visionIds = modelsForKind("text-vision").map((entry) => entry.id);
		expect(visionIds).toContain("gemini-3.5-flash");
		expect(visionIds).toContain("gemini-3.1-pro-preview");
		expect(visionIds).toContain("glm-4.5v");
	});

	it("keeps text-only models out of the vision picker", () => {
		const visionIds = modelsForKind("text-vision").map((entry) => entry.id);
		for (const textOnly of TEXT_ONLY_IDS) {
			expect(visionIds).not.toContain(textOnly);
		}
		// Each text-only model is catalogued and declares only the `text` kind.
		for (const id of TEXT_ONLY_IDS) {
			const entry = MODEL_CATALOG.find((model) => model.id === id);
			expect(entry, id).toBeDefined();
			expect(entry?.kinds).toEqual(["text"]);
		}
	});

	it("has unique ids and a valid envVar for every non-mock model", () => {
		const ids = MODEL_CATALOG.map((entry) => entry.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const entry of MODEL_CATALOG) {
			expect(entry.envVar, entry.id).toBeTruthy();
		}
	});
});
