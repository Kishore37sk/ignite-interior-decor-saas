import { NextResponse, type NextRequest } from "next/server";
import { logServerError } from "@/lib/errors";
import { LOGIN_PATH } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";

/** Reject cross-site form posts (browsers always send Origin on POST). */
function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Sign out (POST only): revokes the refresh token server-side and clears the auth
 * cookies, then redirects to the login page with a 303 so the browser issues a GET.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) logServerError("auth.signout", error);

  const response = NextResponse.redirect(new URL(`${LOGIN_PATH}?message=signed_out`, request.url), {
    status: 303,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
