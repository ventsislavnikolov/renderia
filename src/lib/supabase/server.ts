import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

export function createSupabaseServerClient(accessToken?: string) {
	return createClient<Database>(
		process.env.VITE_SUPABASE_URL ?? "",
		process.env.SUPABASE_SECRET_KEY ?? "",
		{
			global: accessToken
				? { headers: { Authorization: `Bearer ${accessToken}` } }
				: undefined,
			auth: { persistSession: false },
		},
	);
}

export function requireUserId(userId: string | null | undefined) {
	if (!userId) {
		throw new Error("Authentication required");
	}
	return userId;
}
