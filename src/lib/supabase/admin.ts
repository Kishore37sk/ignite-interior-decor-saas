import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "@/lib/env";
import type { Database } from "@/types/database";
import type { TypedSupabaseClient } from "@/types/supabase";

/**
 * Service-role client that BYPASSES Row Level Security.
 *
 * Only for privileged server-side operations that RLS cannot express (inviting users,
 * banning/unbanning auth users, bootstrap). Always authorise the caller with
 * `requireRole("owner")` before using it, and never pass it to client code.
 */
export function createAdminClient(): TypedSupabaseClient {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey || serviceRoleKey.trim() === "") {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to the server environment (.env.local) — " +
        "never prefix it with NEXT_PUBLIC_.",
    );
  }
  return createClient<Database>(getSupabaseUrl(), serviceRoleKey.trim(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
