import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { normalizeImageToPng } from "../../../src/server/image-normalize";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

function makeJpeg(width: number, height: number): Promise<Buffer> {
	return sharp({
		create: {
			width,
			height,
			channels: 3,
			background: { r: 200, g: 180, b: 160 },
		},
	})
		.jpeg()
		.toBuffer();
}

describe("normalizeImageToPng", () => {
	it("re-encodes a JPEG as PNG", async () => {
		const result = await normalizeImageToPng(await makeJpeg(64, 48));

		expect(result).not.toBeNull();
		expect(result?.subarray(0, 4)).toStrictEqual(PNG_SIGNATURE);
		const meta = await sharp(result as Buffer).metadata();
		expect(meta.width).toBe(64);
		expect(meta.height).toBe(48);
	});

	it("caps the long edge at 2048 while preserving aspect ratio", async () => {
		const result = await normalizeImageToPng(await makeJpeg(4096, 2048));

		const meta = await sharp(result as Buffer).metadata();
		expect(meta.width).toBe(2048);
		expect(meta.height).toBe(1024);
	});

	it("returns null for bytes that aren't a decodable image", async () => {
		const result = await normalizeImageToPng(Buffer.from([1, 2, 3, 4]));

		expect(result).toBeNull();
	});
});
