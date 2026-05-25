/**
 * Read a required environment variable. Throws at module load if missing so
 * misconfiguration fails loudly instead of producing silent broken clients.
 */
export function requireEnv(
	source: Record<string, string | undefined>,
	name: string,
): string {
	const value = source[name];
	if (!value) {
		throw new Error(`Missing required env var: ${name}`);
	}
	return value;
}
