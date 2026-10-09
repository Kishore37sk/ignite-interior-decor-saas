import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { logServerError } from "@/lib/errors";
import { FORBIDDEN_PATH, LOGIN_PATH, canAccessRoute } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppRole, UserStatus } from "@/types/database";

/** The signed-in, active user with an assigned role (ARCHITECTURE §8). */
export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  role: AppRole;
  status: UserStatus;
  employeeId: string | null;
  avatarUrl: string | null;
};

export type BlockedReason = "inactive" | "no_role" | "no_profile";

type SessionState =
  | { kind: "anonymous" }
  | { kind: "blocked"; reason: BlockedReason; userId: string }
  | { kind: "active"; user: CurrentUser };

/** Resolve the auth user + profile once per request (React `cache`). */
const loadSession = cache(async (): Promise<SessionState> => {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return { kind: "anonymous" };

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, status, employee_id, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    // A transient failure must not sign the user out; let the error boundary handle it.
    logServerError("auth.loadProfile", error);
    throw new Error("Unable to load your profile. Please try again.");
  }
  if (!profile) return { kind: "blocked", reason: "no_profile", userId: user.id };
  if (profile.status !== "active") return { kind: "blocked", reason: "inactive", userId: user.id };
  if (!profile.role) return { kind: "blocked", reason: "no_role", userId: user.id };

  return {
    kind: "active",
    user: {
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      role: profile.role,
      status: profile.status,
      employeeId: profile.employee_id,
      avatarUrl: profile.avatar_url,
    },
  };
});

/** Current active user, or `null` when signed out / inactive / without a role. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const state = await loadSession();
  return state.kind === "active" ? state.user : null;
}

/** Login error code shown for each blocked reason (see the login page). */
const BLOCKED_ERROR: Record<BlockedReason, string> = {
  inactive: "inactive",
  no_role: "no_access",
  no_profile: "no_access",
};

/**
 * Require an active user. Anonymous → `/login`; inactive or role-less accounts are
 * signed out (session revoked server-side) and sent to `/login?error=…`.
 */
export async function requireUser(): Promise<CurrentUser> {
  const state = await loadSession();
  if (state.kind === "active") return state.user;
  if (state.kind === "blocked") {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();
    if (error) logServerError("auth.requireUser.signOut", error);
    redirect(`${LOGIN_PATH}?error=${BLOCKED_ERROR[state.reason]}`);
  }
  redirect(LOGIN_PATH);
}

/** Require one of `roles`; otherwise render the forbidden page. */
export async function requireRole(...roles: AppRole[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect(FORBIDDEN_PATH);
  return user;
}

/** Require access to `pathname` according to the shared route → roles map. */
export async function requireRouteAccess(pathname: string): Promise<CurrentUser> {
  const user = await requireUser();
  if (!canAccessRoute(pathname, user.role)) redirect(FORBIDDEN_PATH);
  return user;
}

export function isOwner(user: Pick<CurrentUser, "role">): boolean {
  return user.role === "owner";
}

export function isAdmin(user: Pick<CurrentUser, "role">): boolean {
  return user.role === "admin";
}

export function isSiteManager(user: Pick<CurrentUser, "role">): boolean {
  return user.role === "site_manager";
}
