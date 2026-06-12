/**
 * Long-edge cap for image-edit inputs. The edit endpoint downsizes anyway,
 * so shipping full-resolution phone photos only inflates the payload.
 */
const MAX_EDIT_DIMENSION = 2048;

/**
 * Decode and re-encode stored photo bytes into a clean sRGB PNG for the
 * image-edit API. Phone uploads routinely arrive as CMYK JPEGs, EXIF-rotated
 * files, or otherwise odd modes that the edit endpoint rejects with
 * "400 Invalid image file or mode" even though browsers and the vision API
 * render them fine. Returns null when the bytes can't be decoded so callers
 * can fall back to the original payload.
 *
 * sharp is imported lazily: this module sits in a server-function file that
 * the client bundle still evaluates, and sharp's native bindings crash the
 * browser at module scope. The import only runs inside server handlers.
 */
export async function normalizeImageToPng(
	buffer: Buffer
): Promise<Buffer | null> {
	try {
		const { default: sharp } = await import("sharp");
		return await sharp(buffer)
			.rotate()
			.resize({
				width: MAX_EDIT_DIMENSION,
				height: MAX_EDIT_DIMENSION,
				fit: "inside",
				withoutEnlargement: true,
			})
			.png()
			.toBuffer();
	} catch {
		return null;
	}
}
