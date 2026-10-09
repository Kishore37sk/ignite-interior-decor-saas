"use server";

import { redirect } from "next/navigation";
import { zodFieldErrors, type FieldErrors } from "@/lib/action-result";
import { friendlyMessage, logServerError } from "@/lib/errors";
import { HOME_PATH, LOGIN_PATH } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";
import { resetPasswordSchema } from "@/lib/validation/auth";

export type ResetPasswordState = {
  error?: string;
  fieldErrors?: FieldErrors;
};

/** Set a new password for the recovered / invited session, then enter the app. */
export async function updatePassword(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: zodFieldErrors(parsed.error) };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: "Your reset link has expired. Please request a new one from the Forgot password page.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code !== "same_password" && error.code !== "weak_password") {
      logServerError("auth.updatePassword", error);
    }
    return { error: friendlyMessage(error, "We couldn't update your password. Please try again.") };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.status !== "active" || !profile.role) {
    await supabase.auth.signOut();
    redirect(`${LOGIN_PATH}?error=${profile?.status === "inactive" ? "inactive" : "no_access"}`);
  }

  redirect(HOME_PATH);
}
