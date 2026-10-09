import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import type { TypedSupabaseClient } from "@/types/supabase";

let browserClient: TypedSupabaseClient | undefined;

/**
 * Supabase client for Client Components (realtime, client-side reads).
 * A single instance is shared per browser tab.
 */
export function createClient(): TypedSupabaseClient {
  if (!browserClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Set them in .env.local.",
      );
    }
    browserClient = createBrowserClient<Database>(url, anonKey);
  }
  return browserClient;
}
