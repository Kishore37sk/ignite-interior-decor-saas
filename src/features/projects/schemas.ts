import { z } from "zod";
import { todayIST } from "@/lib/dates";
import {
  checkbox,
  dateOnly,
  emptyToUndefined,
  documentCategorySchema,
  memberRoleSchema,
  milestoneStatusSchema,
  optionalDate,
  optionalMoney,
  optionalText,
  optionalUuid,
  paymentModeSchema,
  percentage,
  prioritySchema,
  projectStatusSchema,
  requiredText,
  uuid,
} from "@/lib/validation/common";
import { PROJECT_DOCUMENT_MAX_BYTES } from "./constants";

const projectCode = z
  .preprocess(
    (v) => (typeof v === "string" ? v.trim().toUpperCase() : v),
    z
      .string()
      .max(20, "Project code must be 20 characters or fewer.")
      .regex(/^$|^[A-Z0-9][A-Z0-9-]{1,19}$/, "Use letters, numbers and dashes only, e.g. P-1042."),
  )
  .optional()
  .transform((v) => (v ? v : null));

/** Owner project create/edit form. Dates are validated across fields. */
export const projectFormSchema = z
  .object({
    client_id: z.preprocess(emptyToUndefined, uuid.optional()),
    name: requiredText("Project name", 160),
    project_code: projectCode,
    project_type: optionalText(60, "Project type"),
    site_address: optionalText(500, "Site address"),
    city: optionalText(80, "City"),
    start_date: optionalDate,
    expected_completion_date: optionalDate,
    handover_date: optionalDate,
    actual_handover_date: optionalDate,
    status: projectStatusSchema,
    priority: prioritySchema,
    progress_percentage: percentage,
    notes: optionalText(4000, "Notes"),
    project_cost: optionalMoney,
    // Create only: becomes the first entry in the payments ledger.
    advance_received: optionalMoney,
    advance_mode: z.preprocess(emptyToUndefined, paymentModeSchema.optional()),
    site_manager_id: optionalUuid,
  })
  .superRefine((v, ctx) => {
    if (!v.client_id) {
      ctx.addIssue({ code: "custom", path: ["client_id"], message: "Choose a client." });
    }
    if (v.start_date && v.expected_completion_date && v.expected_completion_date < v.start_date) {
      ctx.addIssue({
        code: "custom",
        path: ["expected_completion_date"],
        message: "Expected completion can't be before the start date.",
      });
    }
    if (v.start_date && v.handover_date && v.handover_date < v.start_date) {
      ctx.addIssue({ code: "custom", path: ["handover_date"], message: "Handover can't be before the start date." });
    }
    if (v.start_date && v.actual_handover_date && v.actual_handover_date < v.start_date) {
      ctx.addIssue({
        code: "custom",
        path: ["actual_handover_date"],
        message: "Actual handover can't be before the start date.",
      });
    }
    if (v.actual_handover_date && v.actual_handover_date > todayIST()) {
      ctx.addIssue({
        code: "custom",
        path: ["actual_handover_date"],
        message: "Actual handover can't be in the future.",
      });
    }
    if (
      v.project_cost !== null &&
      v.advance_received !== null &&
      v.project_cost > 0 &&
      v.advance_received > v.project_cost
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["advance_received"],
        message: "Advance received can't be more than the project cost.",
      });
    }
    if (v.advance_received !== null && v.advance_received > 0 && !v.advance_mode) {
      ctx.addIssue({ code: "custom", path: ["advance_mode"], message: "Choose how the advance was paid." });
    }
  });

export type ProjectFormValues = z.output<typeof projectFormSchema>;

/** Site manager / owner progress update (rpc submit_project_update). */
export const projectUpdateSchema = z.object({
  project_id: uuid,
  status: projectStatusSchema,
  progress: percentage,
  update_date: dateOnly.refine((d) => d <= todayIST(), "Update date can't be in the future."),
  milestone: optionalText(200, "Milestone"),
  expected_completion_date: optionalDate,
  issues: optionalText(4000, "Issues"),
  notes: optionalText(4000, "Notes"),
  next_action: optionalText(4000, "Next action"),
});

/** Milestone edit dialog (rpc update_project_milestone). */
export const milestoneFormSchema = z
  .object({
    milestone_id: uuid,
    project_id: uuid,
    status: milestoneStatusSchema,
    start_date: optionalDate,
    target_date: optionalDate,
    completed_date: optionalDate,
    notes: optionalText(2000, "Notes"),
  })
  .superRefine((v, ctx) => {
    if (v.start_date && v.target_date && v.target_date < v.start_date) {
      ctx.addIssue({ code: "custom", path: ["target_date"], message: "Target date can't be before the start date." });
    }
    if (v.completed_date && v.completed_date > todayIST()) {
      ctx.addIssue({ code: "custom", path: ["completed_date"], message: "Completed date can't be in the future." });
    }
  });

/** Assign / update a project member (rpc assign_project_member). */
export const assignMemberSchema = z.object({
  project_id: uuid,
  user_id: uuid,
  member_role: memberRoleSchema,
  can_view_financials: checkbox,
  replace_existing: checkbox,
});

export const removeMemberSchema = z.object({ project_id: uuid, user_id: uuid });

/** Metadata row written after a successful browser upload to storage. */
export const registerDocumentSchema = z
  .object({
    project_id: uuid,
    category: documentCategorySchema,
    storage_path: z.string().trim().min(1).max(1024),
    file_name: requiredText("File name", 255),
    mime_type: optionalText(120, "File type"),
    size_bytes: z
      .number({ error: "Invalid file size." })
      .int()
      .min(0)
      .max(PROJECT_DOCUMENT_MAX_BYTES, "Files can be at most 25 MB."),
  })
  .superRefine((v, ctx) => {
    const prefix = `${v.project_id}/${v.category}/`;
    const rest = v.storage_path.slice(prefix.length);
    if (!v.storage_path.startsWith(prefix) || rest.length === 0 || rest.includes("/") || rest.includes("..")) {
      ctx.addIssue({ code: "custom", path: ["storage_path"], message: "Invalid storage path." });
    }
  });
