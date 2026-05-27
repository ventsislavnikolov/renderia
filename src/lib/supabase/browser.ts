import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "../env";
import type { Database } from "../types/database";

export const supabaseBrowser = createClient<Database>(
	requireEnv(
		import.meta.env as Record<string, string | undefined>,
		"VITE_SUPABASE_URL"
	),
	requireEnv(
		import.meta.env as Record<string, string | undefined>,
		"VITE_SUPABASE_PUBLISHABLE_KEY"
	),
	{
		auth: {
			persistSession: true,
			detectSessionInUrl: true,
			flowType: "pkce",
		},
	}
);
