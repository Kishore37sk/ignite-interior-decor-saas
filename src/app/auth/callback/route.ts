import { NextResponse, type NextRequest } from "next/server";
import { logServerError } from "@/lib/errors";
import { HOME_PATH, LOGIN_PATH, safeNextPath } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";

/** OAuth / PKCE callback: exchange `?code=` for a session cookie, then continue to `next`. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"), HOME_PATH);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
    logServerError("auth.callback.exchangeCode", error);
  }

  return NextResponse.redirect(new URL(`${LOGIN_PATH}?error=link`, request.url));
}
