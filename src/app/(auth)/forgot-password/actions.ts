"use server";

import { zodFieldErrors, type FieldErrors } from "@/lib/action-result";
import { getSiteUrl } from "@/lib/env";
import { friendlyMessage, logServerError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { forgotPasswordSchema } from "@/lib/validation/auth";

export type ForgotPasswordState = {
  status: "idle" | "sent" | "error";
  error?: string;
  fieldErrors?: FieldErrors;
  email?: string;
};

/**
 * Send a recovery email. The response is identical whether or not the account exists,
 * so the form can't be used to discover registered emails.
 */
export async function requestPasswordReset(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const rawEmail = formData.get("email");
  const email = typeof rawEmail === "string" ? rawEmail.trim() : "";
  const parsed = forgotPasswordSchema.safeParse({ email: rawEmail });
  if (!parsed.success) {
    return {
      status: "error",
      error: "Please enter a valid email address.",
      fieldErrors: zodFieldErrors(parsed.error),
      email,
    };
  }

  const supabase = await createClient();
  const redirectTo = `${getSiteUrl()}/auth/confirm?next=${encodeURIComponent("/reset-password")}`;
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo });

  if (error) {
    logServerError("auth.resetPasswordForEmail", error);
    // Only surface rate limiting / connectivity; anything else looks like success.
    if (error.status === 429 || error.code?.startsWith("over_") || error.name === "AuthRetryableFetchError") {
      return { status: "error", error: friendlyMessage(error), email };
    }
  }
  return { status: "sent", email: parsed.data.email };
}
