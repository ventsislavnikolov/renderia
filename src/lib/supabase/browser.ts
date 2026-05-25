import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

export const supabaseBrowser = createClient<Database>(
	import.meta.env.VITE_SUPABASE_URL ?? "",
	import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
);
