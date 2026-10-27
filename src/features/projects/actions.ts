"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireUser } from "@/lib/auth";
import {
  fail,
  failFromError,
  ok,
  validationFailure,
  type ActionResult,
} from "@/lib/action-result";
import { PROJECT_DOCUMENTS_BUCKET, SIGNED_URL_TTL_SECONDS } from "@/lib/constants";
import { friendlyMessage, isRpcError, logServerError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { formDataToObject, uuid } from "@/lib/validation/common";
import {
  assignMemberSchema,
  milestoneFormSchema,
  projectFormSchema,
  projectUpdateSchema,
  registerDocumentSchema,
  removeMemberSchema,
  type ProjectFormValues,
} from "./schemas";

type Supabase = Awaited<ReturnType<typeof createClient>>;

function revalidateProject(projectId: string, clientId?: string | null) {
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
  revalidatePath("/clients");
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505";
}

const CODE_TAKEN = "This project code is already in use. Choose another or leave it blank to auto-generate.";

function projectColumns(values: ProjectFormValues) {
  return {
    client_id: values.client_id ?? "",
    name: values.name,
    project_type: values.project_type,
    site_address: values.site_address,
    city: values.city,
    start_date: values.start_date,
    expected_completion_date: values.expected_completion_date,
    handover_date: values.handover_date,
    actual_handover_date: values.actual_handover_date,
    status: values.status,
    priority: values.priority,
    progress_percentage: values.progress_percentage,
    notes: values.notes,
  };
}

async function ensureActiveClient(supabase: Supabase, clientId: string): Promise<string | null> {
  const { data, error } = await supabase.from("clients").select("id, archived_at").eq("id", clientId).maybeSingle();
  if (error) {
    logServerError("projects.ensureClient", error);
    return "We couldn't verify the client. Please try again.";
  }
  if (!data) return "That client no longer exists.";
  if (data.archived_at) return "This client is archived. Restore the client before adding projects.";
  return null;
}

/** Saves financials and the site manager after the project row; returns warnings instead of failing. */
async function saveProjectExtras(
  supabase: Supabase,
  projectId: string,
  values: ProjectFormValues,
  currentSiteManagerIds: readonly string[],
): Promise<string[]> {
  const warnings: string[] = [];

  // Amount received lives in project_payments (the advance is recorded by createProjectAction).
  const { error: finError } = await supabase
    .from("project_financials")
    .upsert({ project_id: projectId, project_cost: values.project_cost ?? 0 }, { onConflict: "project_id" });
  if (finError) {
    logServerError("projects.saveFinancials", finError);
    warnings.push(`the project cost couldn't be saved (${friendlyMessage(finError)})`);
  }

  // The form edits a single "lead" site manager. Keeping one that is already assigned
  // leaves any additional site managers (managed from the Team card) untouched; picking a
  // different person replaces the site manager assignment.
  const wanted = values.site_manager_id;
  if (wanted && !currentSiteManagerIds.includes(wanted)) {
    const { error } = await supabase.rpc("assign_project_member", {
      p_project_id: projectId,
      p_user_id: wanted,
      p_member_role: "site_manager",
      p_can_view_financials: false,
      p_replace_existing: true,
    });
    if (error) {
      logServerError("projects.assignSiteManager", error);
      warnings.push(`the site manager couldn't be assigned (${friendlyMessage(error)})`);
    }
  } else if (!wanted && currentSiteManagerIds.length > 0) {
    for (const userId of currentSiteManagerIds) {
      const { error } = await supabase.rpc("remove_project_member", { p_project_id: projectId, p_user_id: userId });
      if (error) {
        logServerError("projects.removeSiteManager", error);
        warnings.push(`a site manager couldn't be removed (${friendlyMessage(error)})`);
      }
    }
  }
  return warnings;
}

function withWarnings(base: string, warnings: string[]): string {
  return warnings.length === 0 ? base : `${base} However, ${warnings.join(" and ")}.`;
}

export type ProjectSaveResult = { id: string; warning: boolean };

export async function createProjectAction(formData: FormData): Promise<ActionResult<ProjectSaveResult>> {
  await requireRole("owner");
  const parsed = projectFormSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationFailure(parsed.error);
  const values = parsed.data;
  const supabase = await createClient();

  const clientProblem = await ensureActiveClient(supabase, values.client_id ?? "");
  if (clientProblem) return fail(clientProblem, { client_id: [clientProblem] });

  const insert = {
    ...projectColumns(values),
    ...(values.project_code ? { project_code: values.project_code } : {}),
  };
  const { data, error } = await supabase.from("projects").insert(insert).select("id").single();
  if (error) {
    if (isUniqueViolation(error)) {
      logServerError("projects.create.duplicateCode", error);
      return fail(CODE_TAKEN, { project_code: [CODE_TAKEN] });
    }
    return failFromError(error, "We couldn't create the project. Please try again.", "projects.create");
  }

  const warnings = await saveProjectExtras(supabase, data.id, values, []);
  if (values.advance_received && values.advance_received > 0) {
    const { error: advanceError } = await supabase.from("project_payments").insert({
      project_id: data.id,
      amount: values.advance_received,
      mode: values.advance_mode ?? "other",
      notes: "Advance entered when the project was created.",
    });
    if (advanceError) {
      logServerError("projects.create.advance", advanceError);
      warnings.push(`the advance couldn't be recorded (${friendlyMessage(advanceError)}); add it from the Payments tab`);
    }
  }
  revalidateProject(data.id, values.client_id);
  return ok({ id: data.id, warning: warnings.length > 0 }, withWarnings("Project created.", warnings));
}

export async function updateProjectAction(
  projectId: string,
  formData: FormData,
): Promise<ActionResult<ProjectSaveResult>> {
  await requireRole("owner");
  const id = uuid.safeParse(projectId);
  if (!id.success) return fail("We couldn't find that project.");
  const parsed = projectFormSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationFailure(parsed.error);
  const values = parsed.data;
  const supabase = await createClient();

  const { data: current, error: currentError } = await supabase
    .from("project_directory")
    .select("id, client_id, site_manager_ids")
    .eq("id", id.data)
    .maybeSingle();
  if (currentError) return failFromError(currentError, "We couldn't load the project.", "projects.update.load");
  if (!current) return fail("We couldn't find that project. It may have been removed.");

  if (current.client_id !== values.client_id) {
    const clientProblem = await ensureActiveClient(supabase, values.client_id ?? "");
    if (clientProblem) return fail(clientProblem, { client_id: [clientProblem] });
  }

  const update = {
    ...projectColumns(values),
    ...(values.project_code ? { project_code: values.project_code } : {}),
  };
  const { error } = await supabase.from("projects").update(update).eq("id", id.data);
  if (error) {
    if (isUniqueViolation(error)) {
      logServerError("projects.update.duplicateCode", error);
      return fail(CODE_TAKEN, { project_code: [CODE_TAKEN] });
    }
    return failFromError(error, "We couldn't save the project. Please try again.", "projects.update");
  }

  const warnings = await saveProjectExtras(supabase, id.data, values, current.site_manager_ids ?? []);
  revalidateProject(id.data, values.client_id);
  if (current.client_id !== values.client_id) revalidatePath(`/clients/${current.client_id}`);
  return ok({ id: id.data, warning: warnings.length > 0 }, withWarnings("Project updated.", warnings));
}

/** Archive or restore a project (owner). Projects are never deleted. */
export async function setProjectArchivedAction(
  projectId: string,
  archived: boolean,
): Promise<ActionResult<{ id: string }>> {
  await requireRole("owner");
  const id = uuid.safeParse(projectId);
  if (!id.success) return fail("We couldn't find that project.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id.data)
    .select("id, client_id")
    .maybeSingle();
  if (error) {
    return failFromError(
      error,
      archived ? "We couldn't archive the project." : "We couldn't restore the project.",
      "projects.setArchived",
    );
  }
  if (!data) return fail("We couldn't find that project. It may have been removed.");
  revalidateProject(data.id, data.client_id);
  return ok({ id: data.id }, archived ? "Project archived." : "Project restored.");
}

/* -------------------------------------------------------------------------- */
/* Progress updates & milestones                                              */
/* -------------------------------------------------------------------------- */

export async function submitProjectUpdateAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const user = await requireRole("owner", "site_manager");
  const parsed = projectUpdateSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationFailure(parsed.error);
  const v = parsed.data;
  if (user.role === "site_manager" && v.status === "cancelled") {
    return fail("Only the owner can cancel a project.", { status: ["Only the owner can cancel a project."] });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_project_update", {
    p_project_id: v.project_id,
    p_status: v.status,
    p_progress: v.progress,
    p_update_date: v.update_date,
    p_milestone: v.milestone,
    p_expected_completion_date: v.expected_completion_date,
    p_issues: v.issues,
    p_notes: v.notes,
    p_next_action: v.next_action,
  });
  if (error) {
    if (isRpcError(error, "PROJECT_CLOSED")) {
      logServerError("projects.submitUpdate.closed", error);
      return fail("This project is completed, cancelled or archived, so updates are closed. Ask the owner to reopen it.");
    }
    return failFromError(error, "We couldn't save the update. Please try again.", "projects.submitUpdate");
  }
  revalidateProject(v.project_id);
  return ok({ id: data }, "Progress update saved.");
}

export async function updateMilestoneAction(formData: FormData): Promise<ActionResult> {
  await requireRole("owner", "site_manager");
  const parsed = milestoneFormSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationFailure(parsed.error);
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_project_milestone", {
    p_milestone_id: v.milestone_id,
    p_status: v.status,
    p_start_date: v.start_date,
    p_target_date: v.target_date,
    p_completed_date: v.completed_date,
    p_notes: v.notes,
  });
  if (error) return failFromError(error, "We couldn't update the milestone.", "projects.updateMilestone");
  revalidatePath(`/projects/${v.project_id}`);
  return ok(undefined, "Milestone updated.");
}

/* -------------------------------------------------------------------------- */
/* Team                                                                       */
/* -------------------------------------------------------------------------- */

export async function assignProjectMemberAction(input: {
  project_id: string;
  user_id: string;
  member_role: string;
  can_view_financials: boolean;
  replace_existing: boolean;
}): Promise<ActionResult> {
  await requireRole("owner");
  const parsed = assignMemberSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error, "Choose a team member.");
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_project_member", {
    p_project_id: v.project_id,
    p_user_id: v.user_id,
    p_member_role: v.member_role,
    p_can_view_financials: v.can_view_financials,
    p_replace_existing: v.replace_existing,
  });
  if (error) return failFromError(error, "We couldn't update the project team.", "projects.assignMember");
  revalidateProject(v.project_id);
  return ok(undefined, "Project team updated.");
}

export async function removeProjectMemberAction(input: { project_id: string; user_id: string }): Promise<ActionResult> {
  await requireRole("owner");
  const parsed = removeMemberSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_project_member", {
    p_project_id: parsed.data.project_id,
    p_user_id: parsed.data.user_id,
  });
  if (error) return failFromError(error, "We couldn't remove the team member.", "projects.removeMember");
  revalidateProject(parsed.data.project_id);
  return ok(undefined, "Team member removed from the project.");
}

/* -------------------------------------------------------------------------- */
/* Documents                                                                  */
/* -------------------------------------------------------------------------- */

/** Records a document after the browser uploaded it to the private bucket. */
export async function registerProjectDocumentAction(input: {
  project_id: string;
  category: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number;
}): Promise<ActionResult<{ id: string }>> {
  const user = await requireRole("owner", "site_manager");
  const parsed = registerDocumentSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error, "The uploaded file details are invalid.");
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_documents")
    .insert({
      project_id: v.project_id,
      category: v.category,
      storage_path: v.storage_path,
      file_name: v.file_name,
      mime_type: v.mime_type,
      size_bytes: v.size_bytes,
      uploaded_by: user.id,
    })
    .select("id")
    .single();
  if (error) return failFromError(error, "The file uploaded, but we couldn't save it to the project.", "projects.registerDocument");
  revalidatePath(`/projects/${v.project_id}`);
  return ok({ id: data.id }, "Document uploaded.");
}

/** Short-lived (60 s) signed download URL for a document the caller can read. */
export async function getDocumentDownloadUrlAction(documentId: string): Promise<ActionResult<{ url: string }>> {
  await requireUser();
  const id = uuid.safeParse(documentId);
  if (!id.success) return fail("We couldn't find that document.");
  const supabase = await createClient();
  const { data: doc, error } = await supabase
    .from("project_documents")
    .select("storage_path, file_name")
    .eq("id", id.data)
    .is("archived_at", null)
    .maybeSingle();
  if (error) return failFromError(error, "We couldn't open the document.", "projects.documentUrl.load");
  if (!doc) return fail("We couldn't find that document, or you don't have access to it.");
  const { data, error: signError } = await supabase.storage
    .from(PROJECT_DOCUMENTS_BUCKET)
    .createSignedUrl(doc.storage_path, SIGNED_URL_TTL_SECONDS, { download: doc.file_name });
  if (signError || !data?.signedUrl) {
    return failFromError(signError, "We couldn't prepare the download. Please try again.", "projects.documentUrl.sign");
  }
  return ok({ url: data.signedUrl });
}

export async function archiveProjectDocumentAction(documentId: string): Promise<ActionResult> {
  await requireRole("owner");
  const id = uuid.safeParse(documentId);
  if (!id.success) return fail("We couldn't find that document.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_documents")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id.data)
    .select("project_id")
    .maybeSingle();
  if (error) return failFromError(error, "We couldn't archive the document.", "projects.archiveDocument");
  if (!data) return fail("We couldn't find that document.");
  revalidatePath(`/projects/${data.project_id}`);
  return ok(undefined, "Document archived.");
}
