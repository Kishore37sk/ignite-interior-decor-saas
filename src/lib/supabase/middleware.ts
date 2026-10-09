import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import type { TypedSupabaseClient } from "@/types/supabase";

export type SessionResult = {
  /** Response carrying refreshed auth cookies — return it (or copy its cookies). */
  response: NextResponse;
  /** Verified user (via `auth.getUser()`), or null. */
  user: User | null;
  supabase: TypedSupabaseClient;
};

/**
 * Refresh the Supabase session for this request and verify the user with the Auth
 * server (`getUser`, never the unverified `getSession`).
 */
export async function updateSession(request: NextRequest): Promise<SessionResult> {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Do not run code between createServerClient and getUser(): it refreshes the token.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return {
    get response() {
      return response;
    },
    user,
    supabase,
  };
}

/** Redirect while preserving any auth cookies set during the refresh. */
export function redirectWithCookies(source: NextResponse, url: URL): NextResponse {
  const redirect = NextResponse.redirect(url);
  for (const cookie of source.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}
