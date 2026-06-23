import { describe, expect, it } from "vitest";
import {
	DEFAULT_STYLE_ID,
	findStylePreset,
	STYLE_PRESETS,
	type StylePreset,
} from "../../../src/lib/ai/style-presets";

const EXPECTED_IDS = [
	"scandinavian",
	"industrial",
	"japandi",
	"midcentury",
	"minimalist",
	"coastal",
	"rustic",
	"boho",
];

describe("STYLE_PRESETS catalogue", () => {
	it("ships exactly the eight expected Styles in picker order", () => {
		expect(STYLE_PRESETS.map((preset) => preset.id)).toEqual(EXPECTED_IDS);
	});

	it("has unique ids", () => {
		const ids = STYLE_PRESETS.map((preset) => preset.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("defaults to Scandinavian and leaves it first", () => {
		expect(DEFAULT_STYLE_ID).toBe("scandinavian");
		expect(STYLE_PRESETS[0]?.id).toBe("scandinavian");
		expect(STYLE_PRESETS[0]?.label).toBe("Scandinavian");
	});

	it("gives every preset a complete, non-empty vocabulary", () => {
		const stringFields: (keyof StylePreset)[] = [
			"id",
			"label",
			"summary",
			"aesthetic",
			"visualStyle",
		];
		const listFields: (keyof StylePreset)[] = [
			"doorRule",
			"windowRule",
			"flooringRule",
			"wallCeilingRule",
			"furnitureRule",
			"negativeStyle",
		];
		for (const preset of STYLE_PRESETS) {
			for (const field of stringFields) {
				expect(
					(preset[field] as string).length,
					`${preset.id}.${field}`
				).toBeGreaterThan(0);
			}
			for (const field of listFields) {
				const list = preset[field] as string[];
				expect(list.length, `${preset.id}.${field}`).toBeGreaterThan(0);
				expect(
					list.every((line) => line.trim().length > 0),
					`${preset.id}.${field} has empty lines`
				).toBe(true);
			}
		}
	});

	it("resolves every catalogue id through findStylePreset", () => {
		for (const preset of STYLE_PRESETS) {
			expect(findStylePreset(preset.id)).toBe(preset);
		}
	});
});
