"use server";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { failFromError, ok, validationFailure, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/env";
import { friendlyMessage, logServerError } from "@/lib/errors";
import { LOGIN_PATH } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";
import { changePasswordSchema } from "@/lib/validation/auth";
import { formDataToObject } from "@/lib/validation/common";
import { ownProfileSchema } from "./schemas";

/** Update the signed-in user's own name and phone (RLS self-update). */
export async function updateOwnProfileAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = ownProfileSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationFailure(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.full_name, phone: parsed.data.phone })
    .eq("id", user.id);
  if (error) return failFromError(error, "We couldn't save your details.", "profile.update");

  revalidatePath("/", "layout");
  return ok(undefined, "Your details were saved.");
}

const WRONG_CURRENT_PASSWORD = "Your current password is incorrect.";

/**
 * Re-verify the signed-in user's current password with a throwaway (cookie-less) client,
 * so a stolen or unattended session can't silently set a new password. The temporary
 * session is revoked straight away.
 */
async function verifyCurrentPassword(email: string, password: string): Promise<"ok" | "wrong" | "error"> {
  const verifier = createSupabaseClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await verifier.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "invalid_credentials" || error.status === 400) return "wrong";
    logServerError("profile.changePassword.verify", error);
    return "error";
  }
  const { error: signOutError } = await verifier.auth.signOut({ scope: "local" });
  if (signOutError) logServerError("profile.changePassword.verifySignOut", signOutError);
  return "ok";
}

/** Change the password of the current session (requires the current password). */
export async function changePasswordAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const supabase = await createClient();
  // Verify against the auth account's email (the profile copy is display data).
  const { data: auth } = await supabase.auth.getUser();
  const verified = await verifyCurrentPassword(auth.user?.email ?? user.email, parsed.data.currentPassword);
  if (verified === "wrong") {
    return { ok: false, error: WRONG_CURRENT_PASSWORD, fieldErrors: { currentPassword: [WRONG_CURRENT_PASSWORD] } };
  }
  if (verified === "error") {
    return { ok: false, error: "We couldn't verify your current password. Please try again in a moment." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code !== "same_password" && error.code !== "weak_password") {
      logServerError("profile.changePassword", error);
    }
    const message = friendlyMessage(error, "We couldn't change your password. Please try again.");
    return {
      ok: false,
      error: message,
      fieldErrors: error.code === "same_password" || error.code === "weak_password" ? { password: [message] } : undefined,
    };
  }
  return ok(undefined, "Your password was changed.");
}

/** Revoke every session of this user (all devices). The client then navigates to `redirectTo`. */
export async function signOutEverywhereAction(): Promise<ActionResult<{ redirectTo: string }>> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "global" });
  if (error) return failFromError(error, "We couldn't sign you out everywhere. Please try again.", "profile.signOutGlobal");
  return ok({ redirectTo: `${LOGIN_PATH}?message=signed_out` }, "Signed out of all devices.");
}
