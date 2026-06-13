/**
 * Compact relative-time label ("now", "5m", "3h", "8d") for an ISO timestamp.
 * Shared by the sidebar room list and the photo tiles so the two never drift.
 */
export function formatRelativeTime(isoString: string): string {
	const ms = Date.now() - new Date(isoString).getTime();
	const minutes = Math.floor(ms / 60_000);
	if (minutes < 1) return "now";
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.floor(hours / 24);
	return `${days}d`;
}

/**
 * Furniture dimensions as an axis-labelled "W 80 × H 202 × D 28 cm" string.
 * Each axis is optional — only the present ones render, so a partial import
 * still reads cleanly. Returns null when no dimension is known.
 */
export function formatFurnitureDimensions(
	widthCm: number | null,
	heightCm: number | null,
	depthCm: number | null
): string | null {
	const parts = [
		widthCm === null ? null : `W ${widthCm}`,
		heightCm === null ? null : `H ${heightCm}`,
		depthCm === null ? null : `D ${depthCm}`,
	].filter((part): part is string => part !== null);
	return parts.length > 0 ? `${parts.join(" × ")} cm` : null;
}

/**
 * Import-time price snapshot. Uses the browser's currency formatting when the
 * currency is a valid ISO 4217 code, falling back to "<amount> <currency>" for
 * anything the platform rejects. Returns null when no price is known.
 */
export function formatFurniturePrice(
	price: number | null,
	currency: string | null
): string | null {
	if (price === null) return null;
	if (currency) {
		try {
			return new Intl.NumberFormat(undefined, {
				style: "currency",
				currency,
			}).format(price);
		} catch {
			return `${price} ${currency}`;
		}
	}
	return String(price);
}
