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
