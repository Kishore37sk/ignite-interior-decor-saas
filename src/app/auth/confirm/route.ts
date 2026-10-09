import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { logServerError } from "@/lib/errors";
import { HOME_PATH, LOGIN_PATH, safeNextPath } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: readonly EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

function isOtpType(value: string | null): value is EmailOtpType {
  return value !== null && (OTP_TYPES as readonly string[]).includes(value);
}

/** Where to land after verification when no explicit `next` was given. */
function defaultNext(type: EmailOtpType | null): string {
  if (type === "invite") return "/reset-password?welcome=1";
  if (type === "recovery") return "/reset-password";
  return HOME_PATH;
}

/**
 * Email link landing for invites and password recovery.
 * Supports both the token-hash template (`?token_hash=…&type=invite|recovery`) and the
 * PKCE redirect (`?code=…`), then redirects to a sanitized `next` path.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const rawType = searchParams.get("type");
  const type = isOtpType(rawType) ? rawType : null;
  const code = searchParams.get("code");

  let next = safeNextPath(searchParams.get("next"), defaultNext(type));
  if (type === "invite" && next === "/reset-password") next = "/reset-password?welcome=1";

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, request.url));
    logServerError("auth.confirm.verifyOtp", error);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
    logServerError("auth.confirm.exchangeCode", error);
  }

  // Recovery/invite links that fail go to the "link expired" state of the reset page.
  const failure =
    type === "recovery" || type === "invite" || next.startsWith("/reset-password")
      ? "/reset-password"
      : `${LOGIN_PATH}?error=link`;
  return NextResponse.redirect(new URL(failure, request.url));
}
