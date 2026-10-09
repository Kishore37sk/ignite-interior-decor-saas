"use server";

import { revalidatePath } from "next/cache";
import { fail, failFromError, ok, validationFailure, type ActionResult } from "@/lib/action-result";
import { requireRole } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/constants";
import { friendlyMessage, logServerError, toFriendlyError } from "@/lib/errors";
import { escapeLikePattern } from "@/lib/search-params";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { formDataToObject } from "@/lib/validation/common";
import type { TypedSupabaseClient } from "@/types/supabase";
import { DEACTIVATED_BAN_DURATION, deliverPasswordLink, type LinkDelivery } from "./auth-admin";
import {
  assignmentChangesSchema,
  createUserSchema,
  passwordLinkSchema,
  reassignSchema,
  setStatusSchema,
  updateUserSchema,
  userIdSchema,
  type AssignmentChanges,
  type ReassignInput,
  type StaffRole,
} from "./schemas";

const SERVER_UNREACHABLE = "Something went wrong. Please try again.";
const ADMIN_NOT_CONFIGURED =
  "User management isn't configured on the server yet: the Supabase service role key is missing from the server environment. Add it to .env.local (or your host's environment variables) and try again.";

type Supabase = Awaited<ReturnType<typeof createClient>>;

type TargetProfile = {
  id: string;
  full_name: string;
  email: string;
  role: StaffRole | "owner" | null;
  status: "active" | "inactive";
};

function revalidateTeamPages(userId?: string) {
  revalidatePath("/users");
  revalidatePath("/site-managers");
  revalidatePath("/admins");
  if (userId) {
    revalidatePath(`/site-managers/${userId}`);
    revalidatePath(`/admins/${userId}`);
  }
}

/** Owner check: requireRole + a fresh RLS read of the caller's own profile. */
async function requireOwner(): Promise<{ ownerId: string; supabase: Supabase } | { error: string }> {
  const owner = await requireRole("owner");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", owner.id)
    .maybeSingle();
  if (error) return { error: toFriendlyError(error, SERVER_UNREACHABLE, "users.requireOwner") };
  if (!data || data.role !== "owner" || data.status !== "active") {
    return { error: "Only the owner can manage users." };
  }
  return { ownerId: owner.id, supabase };
}

function adminClientOrError(): { admin: TypedSupabaseClient } | { error: string } {
  try {
    return { admin: createAdminClient() };
  } catch (err) {
    logServerError("users.createAdminClient", err);
    return { error: ADMIN_NOT_CONFIGURED };
  }
}

async function loadTarget(supabase: Supabase, userId: string): Promise<TargetProfile | { error: string }> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, status")
    .eq("id", userId)
    .maybeSingle();
  if (error) return { error: toFriendlyError(error, SERVER_UNREACHABLE, "users.loadTarget") };
  if (!data) return { error: "We couldn't find that user." };
  return data as TargetProfile;
}

async function employeeIdTaken(supabase: Supabase, employeeId: string, excludeId?: string): Promise<boolean> {
  let query = supabase
    .from("profiles")
    .select("id")
    .ilike("employee_id", escapeLikePattern(employeeId))
    .limit(1);
  if (excludeId) query = query.neq("id", excludeId);
  const { data, error } = await query;
  if (error) {
    // The unique index remains the hard guard.
    logServerError("users.employeeIdTaken", error);
    return false;
  }
  return (data ?? []).length > 0;
}

function isEmailExistsError(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | null;
  if (!e) return false;
  if (e.code === "email_exists" || e.code === "user_already_exists") return true;
  return typeof e.message === "string" && /already (been )?registered|already exists/i.test(e.message);
}

/* -------------------------------------------------------------------------- */
/* Create                                                                     */
/* -------------------------------------------------------------------------- */

export type CreateUserResult = { userId: string; email: string; fullName: string; role: StaffRole } & (
  | LinkDelivery
  | { delivery: "none"; emailError: string }
);

export async function createUserAction(formData: FormData): Promise<ActionResult<CreateUserResult>> {
  const ctx = await requireOwner();
  if ("error" in ctx) return fail(ctx.error);
  const { supabase } = ctx;

  const parsed = createUserSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationFailure(parsed.error);
  const values = parsed.data;

  // Friendly pre-checks (unique indexes remain the real guard).
  const { data: existing, error: existingError } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", values.email)
    .limit(1);
  if (existingError) return failFromError(existingError, SERVER_UNREACHABLE, "users.create.emailCheck");
  if ((existing ?? []).length > 0) {
    return fail("An account with this email already exists.", {
      email: ["An account with this email already exists."],
    });
  }
  if (values.employee_id && (await employeeIdTaken(supabase, values.employee_id))) {
    return fail("This employee ID is already in use.", { employee_id: ["This employee ID is already in use."] });
  }

  const adminResult = adminClientOrError();
  if ("error" in adminResult) return fail(adminResult.error);
  const { admin } = adminResult;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: values.email,
    email_confirm: true,
    app_metadata: { role: values.role, ...(values.employee_id ? { employee_id: values.employee_id } : {}) },
    user_metadata: { full_name: values.full_name, ...(values.phone ? { phone: values.phone } : {}) },
  });
  if (createError || !created?.user) {
    if (isEmailExistsError(createError)) {
      return fail("An account with this email already exists.", {
        email: ["An account with this email already exists."],
      });
    }
    logServerError("users.create.createUser", createError);
    return fail(
      friendlyMessage(createError, "We couldn't create this user. Check the details (email and employee ID must be unique) and try again."),
    );
  }
  const userId = created.user.id;

  // Supabase writes app_metadata after the auth.users INSERT, so the profile
  // trigger can miss the role. Set it explicitly (service role: owner-checked above).
  const { error: roleError } = await admin
    .from("profiles")
    .update({
      role: values.role,
      status: "active",
      ...(values.employee_id ? { employee_id: values.employee_id } : {}),
      ...(values.phone ? { phone: values.phone } : {}),
    })
    .eq("id", userId);
  if (roleError) {
    logServerError("users.create.role", roleError);
    revalidateTeamPages(userId);
    return fail(
      `${values.full_name}'s login was created, but their role couldn't be saved. Open the user and try again, or contact support.`,
    );
  }

  const warnings: string[] = [];
  if (values.joining_date) {
    // Owner RLS client so the audit log attributes the change to the owner.
    const { error } = await supabase.from("profiles").update({ joining_date: values.joining_date }).eq("id", userId);
    if (error) {
      logServerError("users.create.joiningDate", error);
      warnings.push("The joining date couldn't be saved — edit the user to add it.");
    }
  }

  let delivery: LinkDelivery;
  try {
    delivery = await deliverPasswordLink(admin, values.email, { welcome: true, mode: "email" });
  } catch (err) {
    logServerError("users.create.passwordLink", err);
    revalidateTeamPages(userId);
    return ok(
      {
        userId,
        email: values.email,
        fullName: values.full_name,
        role: values.role,
        delivery: "none",
        emailError: "We couldn't create a password setup link.",
      },
      `${values.full_name} was created, but we couldn't create a password setup link. Use "Send password link" from the user's actions.`,
    );
  }

  revalidateTeamPages(userId);
  const base =
    delivery.delivery === "email"
      ? `${values.full_name} was added as ${ROLE_LABELS[values.role]}. A password setup email is on its way.`
      : `${values.full_name} was added as ${ROLE_LABELS[values.role]}. Share the one-time setup link with them.`;
  return ok(
    { userId, email: values.email, fullName: values.full_name, role: values.role, ...delivery },
    [base, ...warnings].join(" "),
  );
}

/* -------------------------------------------------------------------------- */
/* Edit                                                                       */
/* -------------------------------------------------------------------------- */

export async function updateUserAction(userId: string, formData: FormData): Promise<ActionResult> {
  const ctx = await requireOwner();
  if ("error" in ctx) return fail(ctx.error);
  const { supabase } = ctx;

  const id = userIdSchema.safeParse(userId);
  if (!id.success) return fail("We couldn't find that user.");
  const parsed = updateUserSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationFailure(parsed.error);
  const values = parsed.data;

  const target = await loadTarget(supabase, id.data);
  if ("error" in target) return fail(target.error);
  if (target.role === "owner") return fail("The owner's details can only be changed from the owner's own profile.");

  if (values.employee_id && (await employeeIdTaken(supabase, values.employee_id, id.data))) {
    return fail("This employee ID is already in use.", { employee_id: ["This employee ID is already in use."] });
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: values.full_name,
      phone: values.phone,
      employee_id: values.employee_id,
      joining_date: values.joining_date,
    })
    .eq("id", id.data);
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return fail("This employee ID is already in use.", { employee_id: ["This employee ID is already in use."] });
    }
    return failFromError(error, "We couldn't save these changes.", "users.update");
  }

  revalidateTeamPages(id.data);
  return ok(undefined, `${values.full_name}'s details were updated.`);
}

/* -------------------------------------------------------------------------- */
/* Activate / deactivate                                                      */
/* -------------------------------------------------------------------------- */

export async function setUserStatusAction(
  userId: string,
  status: "active" | "inactive",
): Promise<ActionResult<{ authSynced: boolean }>> {
  const ctx = await requireOwner();
  if ("error" in ctx) return fail(ctx.error);
  const { supabase, ownerId } = ctx;

  const parsed = setStatusSchema.safeParse({ user_id: userId, status });
  if (!parsed.success) return fail("Invalid request.");
  if (parsed.data.user_id === ownerId) return fail("You can't change your own status.");

  const target = await loadTarget(supabase, parsed.data.user_id);
  if ("error" in target) return fail(target.error);
  if (target.role === "owner") return fail("Owner accounts can't be deactivated.");

  const adminResult = adminClientOrError();
  if ("error" in adminResult) return fail(adminResult.error);

  const { error } = await supabase.rpc("set_user_status", {
    p_user_id: parsed.data.user_id,
    p_status: parsed.data.status,
  });
  if (error) return failFromError(error, "We couldn't change this user's status.", "users.setStatus");

  const { error: banError } = await adminResult.admin.auth.admin.updateUserById(parsed.data.user_id, {
    ban_duration: parsed.data.status === "inactive" ? DEACTIVATED_BAN_DURATION : "none",
  });
  revalidateTeamPages(parsed.data.user_id);

  if (banError) {
    logServerError("users.setStatus.ban", banError);
    return ok(
      { authSynced: false },
      parsed.data.status === "inactive"
        ? `${target.full_name} is now inactive and can no longer use the app, but their sign-in couldn't be blocked at the auth level. Try deactivating again later.`
        : `${target.full_name} is active again, but their sign-in is still blocked at the auth level. Try activating again.`,
    );
  }
  return ok(
    { authSynced: true },
    parsed.data.status === "inactive"
      ? `${target.full_name} was deactivated. Their history and assignments are kept.`
      : `${target.full_name} was activated and can sign in again.`,
  );
}

/* -------------------------------------------------------------------------- */
/* Password links                                                             */
/* -------------------------------------------------------------------------- */

export type PasswordLinkResult = { email: string; fullName: string } & LinkDelivery;

export async function sendPasswordLinkAction(
  userId: string,
  mode: "email" | "link",
): Promise<ActionResult<PasswordLinkResult>> {
  const ctx = await requireOwner();
  if ("error" in ctx) return fail(ctx.error);
  const { supabase } = ctx;

  const parsed = passwordLinkSchema.safeParse({ user_id: userId, mode });
  if (!parsed.success) return fail("Invalid request.");

  const target = await loadTarget(supabase, parsed.data.user_id);
  if ("error" in target) return fail(target.error);
  if (target.role === "owner") return fail("Use “Forgot password” on the sign-in page to reset the owner's password.");
  if (target.status !== "active") return fail("Activate this user before sending a password link.");

  const adminResult = adminClientOrError();
  if ("error" in adminResult) return fail(adminResult.error);

  try {
    const delivery = await deliverPasswordLink(adminResult.admin, target.email, {
      welcome: false,
      mode: parsed.data.mode,
    });
    return ok(
      { email: target.email, fullName: target.full_name, ...delivery },
      delivery.delivery === "email"
        ? `A password link was emailed to ${target.email}.`
        : `A one-time password link for ${target.full_name} is ready to share.`,
    );
  } catch (err) {
    return failFromError(err, "We couldn't create a password link. Please try again.", "users.passwordLink");
  }
}

/* -------------------------------------------------------------------------- */
/* Project assignments                                                        */
/* -------------------------------------------------------------------------- */

export type AssignmentOption = {
  id: string;
  project_code: string;
  name: string;
  client_name: string;
  status: string;
  site_manager_name: string | null;
};

export type AssignmentOptions = {
  role: StaffRole;
  active: boolean;
  projects: AssignmentOption[];
  assigned: string[];
};

/** Loads projects + current active assignments for the "Assign projects" dialog. */
export async function getAssignmentOptionsAction(userId: string): Promise<ActionResult<AssignmentOptions>> {
  const ctx = await requireOwner();
  if ("error" in ctx) return fail(ctx.error);
  const { supabase } = ctx;

  const id = userIdSchema.safeParse(userId);
  if (!id.success) return fail("We couldn't find that user.");
  const target = await loadTarget(supabase, id.data);
  if ("error" in target) return fail(target.error);
  if (target.role !== "admin" && target.role !== "site_manager") {
    return fail("Only admins and site managers can be assigned to projects.");
  }

  const [projectsRes, membersRes] = await Promise.all([
    supabase
      .from("project_directory")
      .select("id, project_code, name, client_name, status, site_manager_name")
      .is("archived_at", null)
      .order("name", { ascending: true })
      .limit(1000),
    supabase.from("project_members").select("project_id").eq("user_id", id.data).eq("status", "active"),
  ]);
  if (projectsRes.error) return failFromError(projectsRes.error, "We couldn't load projects.", "users.assignOptions");
  if (membersRes.error) return failFromError(membersRes.error, "We couldn't load assignments.", "users.assignOptions");

  return ok({
    role: target.role,
    active: target.status === "active",
    projects: projectsRes.data ?? [],
    assigned: (membersRes.data ?? []).map((m) => m.project_id),
  });
}

export async function saveProjectAssignmentsAction(
  input: AssignmentChanges,
): Promise<ActionResult<{ added: number; removed: number }>> {
  const ctx = await requireOwner();
  if ("error" in ctx) return fail(ctx.error);
  const { supabase } = ctx;

  const parsed = assignmentChangesSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const { user_id, add, remove } = parsed.data;
  if (add.length === 0 && remove.length === 0) return fail("No changes to save.");

  const target = await loadTarget(supabase, user_id);
  if ("error" in target) return fail(target.error);
  if (target.role !== "admin" && target.role !== "site_manager") {
    return fail("Only admins and site managers can be assigned to projects.");
  }
  if (add.length > 0 && target.status !== "active") {
    return fail("Inactive users can't receive new assignments. Activate them first.");
  }

  let added = 0;
  let removed = 0;
  const errors: string[] = [];
  for (const projectId of add) {
    const { error } = await supabase.rpc("assign_project_member", {
      p_project_id: projectId,
      p_user_id: user_id,
      p_member_role: target.role,
    });
    if (error) errors.push(toFriendlyError(error, "An assignment failed.", "users.assignProject"));
    else added += 1;
  }
  for (const projectId of remove) {
    const { error } = await supabase.rpc("remove_project_member", { p_project_id: projectId, p_user_id: user_id });
    if (error) errors.push(toFriendlyError(error, "Removing an assignment failed.", "users.removeProject"));
    else removed += 1;
  }

  revalidateTeamPages(user_id);
  revalidatePath("/projects");
  if (errors.length > 0 && added + removed === 0) return fail(errors[0] ?? "We couldn't save the assignments.");

  const parts: string[] = [];
  if (added) parts.push(`${added} project${added === 1 ? "" : "s"} assigned`);
  if (removed) parts.push(`${removed} removed`);
  const summary = `${target.full_name}: ${parts.join(", ")}.`;
  return ok(
    { added, removed },
    errors.length > 0 ? `${summary} ${errors.length} change${errors.length === 1 ? "" : "s"} failed: ${errors[0]}` : summary,
  );
}

/** Move a (typically inactive) user's active project assignments to another active user. */
export async function reassignProjectsAction(input: ReassignInput): Promise<ActionResult<{ moved: number }>> {
  const ctx = await requireOwner();
  if ("error" in ctx) return fail(ctx.error);
  const { supabase } = ctx;

  const parsed = reassignSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const { from_user_id, to_user_id, project_ids } = parsed.data;
  if (from_user_id === to_user_id) return fail("Choose a different person to take over these projects.", { to_user_id: ["Choose a different person."] });

  const [from, to] = await Promise.all([loadTarget(supabase, from_user_id), loadTarget(supabase, to_user_id)]);
  if ("error" in from) return fail(from.error);
  if ("error" in to) return fail(to.error, { to_user_id: [to.error] });
  if (from.role !== "site_manager" && from.role !== "admin") return fail("Only staff assignments can be reassigned.");
  if (to.role !== from.role) return fail("The new assignee must have the same role.", { to_user_id: ["Must have the same role."] });
  if (to.status !== "active") return fail("The new assignee must be active.", { to_user_id: ["Must be active."] });

  const [{ data: memberships, error }, { data: existing, error: existingError }] = await Promise.all([
    supabase
      .from("project_members")
      .select("project_id")
      .eq("user_id", from_user_id)
      .eq("status", "active")
      .in("project_id", project_ids),
    supabase
      .from("project_members")
      .select("project_id, can_view_financials")
      .eq("user_id", to_user_id)
      .eq("status", "active")
      .in("project_id", project_ids),
  ]);
  if (error) return failFromError(error, "We couldn't load the current assignments.", "users.reassign.load");
  if (existingError) return failFromError(existingError, "We couldn't load the current assignments.", "users.reassign.loadTarget");
  // Financial access is an explicit per-person grant by the owner (app.md §5, §55): it is never
  // carried over from the previous assignee. A grant the new assignee already holds is kept.
  const targetGrant = new Map((existing ?? []).map((row) => [row.project_id, row.can_view_financials]));

  let moved = 0;
  const errors: string[] = [];
  for (const membership of memberships ?? []) {
    const { error: assignError } = await supabase.rpc("assign_project_member", {
      p_project_id: membership.project_id,
      p_user_id: to_user_id,
      p_member_role: from.role,
      p_can_view_financials: targetGrant.get(membership.project_id) ?? false,
    });
    if (assignError) {
      errors.push(toFriendlyError(assignError, "A reassignment failed.", "users.reassign.assign"));
      continue;
    }
    const { error: removeError } = await supabase.rpc("remove_project_member", {
      p_project_id: membership.project_id,
      p_user_id: from_user_id,
    });
    if (removeError) {
      errors.push(toFriendlyError(removeError, "Removing the previous assignee failed.", "users.reassign.remove"));
      continue;
    }
    moved += 1;
  }

  revalidateTeamPages(from_user_id);
  revalidateTeamPages(to_user_id);
  revalidatePath("/projects");
  if (moved === 0) return fail(errors[0] ?? "No active assignments were found to move.");
  const message = `${moved} project${moved === 1 ? "" : "s"} moved from ${from.full_name} to ${to.full_name}.`;
  return ok({ moved }, errors.length > 0 ? `${message} ${errors.length} failed: ${errors[0]}` : message);
}
