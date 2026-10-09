import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSiteUrl, getSupabaseAnonKey, getSupabaseUrl } from "@/lib/env";
import { friendlyMessage, logServerError } from "@/lib/errors";
import type { TypedSupabaseClient } from "@/types/supabase";

/** How the password setup/reset link reached the user. */
export type LinkDelivery =
  | { delivery: "email" }
  /** One-time link to show to the owner ONCE (never stored). `emailError` explains why email was skipped/failed. */
  | { delivery: "link"; link: string; emailError: string | null };

function nextPath(welcome: boolean): string {
  return welcome ? "/reset-password?welcome=1" : "/reset-password";
}

function confirmRedirect(welcome: boolean): string {
  return `${getSiteUrl()}/auth/confirm?next=${encodeURIComponent(nextPath(welcome))}`;
}

/**
 * Stateless anon client for sending auth emails on someone else's behalf. Using the
 * cookie-bound server client would store a PKCE verifier in the OWNER's browser.
 */
function statelessAnonClient() {
  return createSupabaseClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: "implicit",
    },
  });
}

/**
 * Generate a one-time recovery link that lands on `/auth/confirm` with a `token_hash`,
 * so it works in any browser regardless of the email template configuration.
 */
export async function generateSetupLink(
  admin: TypedSupabaseClient,
  email: string,
  welcome: boolean,
): Promise<string> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: confirmRedirect(welcome) },
  });
  const hashed = data?.properties?.hashed_token;
  if (error || !hashed) {
    throw error ?? new Error("generateLink returned no token");
  }
  const params = new URLSearchParams({ token_hash: hashed, type: "recovery", next: nextPath(welcome) });
  return `${getSiteUrl()}/auth/confirm?${params.toString()}`;
}

/**
 * Email a password setup/reset link; when email sending fails (SMTP not configured,
 * rate limits) fall back to a one-time link the owner can share manually.
 */
export async function deliverPasswordLink(
  admin: TypedSupabaseClient,
  email: string,
  options: { welcome: boolean; mode: "email" | "link" },
): Promise<LinkDelivery> {
  let emailError: string | null = null;
  if (options.mode === "email") {
    const { error } = await statelessAnonClient().auth.resetPasswordForEmail(email, {
      redirectTo: confirmRedirect(options.welcome),
    });
    if (!error) return { delivery: "email" };
    logServerError("users.resetPasswordForEmail", error);
    emailError = friendlyMessage(error, "The email could not be sent.");
  }
  const link = await generateSetupLink(admin, email, options.welcome);
  return { delivery: "link", link, emailError };
}

/** Ban duration used to block sign-in of deactivated users (~100 years). */
export const DEACTIVATED_BAN_DURATION = "876000h";
