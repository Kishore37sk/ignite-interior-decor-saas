import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database";

/** Supabase client typed against our hand-written {@link Database} contract. */
export type TypedSupabaseClient = SupabaseClient<Database>;
