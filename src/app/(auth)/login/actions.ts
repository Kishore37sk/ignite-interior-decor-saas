"use server";

import { redirect } from "next/navigation";
import { zodFieldErrors, type FieldErrors } from "@/lib/action-result";
import { friendlyMessage, logServerError } from "@/lib/errors";
import { safeNextPath } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validation/auth";

export type LoginState = {
  error?: string;
  fieldErrors?: FieldErrors;
  /** Echoed back so the email field keeps its value after an error. */
  email?: string;
};

const DEACTIVATED_MESSAGE = "Your account has been deactivated. Contact the owner to regain access.";
const NO_ACCESS_MESSAGE =
  "Your account doesn't have access to the portal yet. Contact the owner to assign your role.";

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const rawEmail = formData.get("email");
  const email = typeof rawEmail === "string" ? rawEmail.trim() : "";

  const parsed = loginSchema.safeParse({
    email: rawEmail,
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    return { error: "Please enter your email and password.", fieldErrors: zodFieldErrors(parsed.error), email };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    // Wrong credentials are expected; only log unexpected failures.
    if (error && error.code !== "invalid_credentials") logServerError("auth.signIn", error);
    return {
      error: friendlyMessage(error, "We couldn't sign you in. Please try again."),
      email,
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError) {
    logServerError("auth.signIn.profile", profileError);
    await supabase.auth.signOut();
    return { error: "We couldn't load your account. Please try again.", email };
  }

  if (!profile || profile.status !== "active") {
    await supabase.auth.signOut();
    return { error: profile ? DEACTIVATED_MESSAGE : NO_ACCESS_MESSAGE, email };
  }
  if (!profile.role) {
    await supabase.auth.signOut();
    return { error: NO_ACCESS_MESSAGE, email };
  }

  redirect(safeNextPath(parsed.data.next));
}
