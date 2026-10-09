import { z } from "zod";
import {
  email,
  optionalDate,
  optionalPhone,
  requiredText,
  uuid,
} from "@/lib/validation/common";
import type { AppRole } from "@/types/database";

/** Roles the owner can create from the app (owners are bootstrapped separately). */
export const STAFF_ROLES = ["admin", "site_manager"] as const satisfies readonly AppRole[];
export type StaffRole = (typeof STAFF_ROLES)[number];

export const staffRoleSchema = z.enum(STAFF_ROLES, { error: "Choose Admin or Site Manager." });

/** Employee ID prefix per role, e.g. SM001 / AD001. */
export const EMPLOYEE_ID_PREFIX: Record<StaffRole, string> = {
  site_manager: "SM",
  admin: "AD",
};

const employeeId = z
  .string()
  .trim()
  .max(20, "Employee ID must be 20 characters or fewer.")
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "Use letters, numbers, dashes or underscores only (e.g. SM003).")
  .transform((v) => v.toUpperCase());

const optionalEmployeeId = z
  .preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), employeeId.optional())
  .transform((v) => v ?? null);

export const createUserSchema = z.object({
  full_name: requiredText("Name", 120),
  email,
  phone: optionalPhone,
  role: staffRoleSchema,
  employee_id: optionalEmployeeId,
  joining_date: optionalDate,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  full_name: requiredText("Name", 120),
  phone: optionalPhone,
  employee_id: optionalEmployeeId,
  joining_date: optionalDate,
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const userIdSchema = uuid;

export const setStatusSchema = z.object({
  user_id: uuid,
  status: z.enum(["active", "inactive"], { error: "Choose a valid status." }),
});

export const passwordLinkSchema = z.object({
  user_id: uuid,
  /** `email`: send via Supabase email (falls back to a link); `link`: generate a link only. */
  mode: z.enum(["email", "link"]),
});

export const assignmentChangesSchema = z.object({
  user_id: uuid,
  add: z.array(uuid).max(200, "Too many projects at once."),
  remove: z.array(uuid).max(200, "Too many projects at once."),
});
export type AssignmentChanges = z.infer<typeof assignmentChangesSchema>;

export const reassignSchema = z.object({
  from_user_id: uuid,
  to_user_id: uuid,
  project_ids: z.array(uuid).min(1, "Choose at least one project.").max(200, "Too many projects at once."),
});
export type ReassignInput = z.infer<typeof reassignSchema>;

/* -------------------------------------------------------------------------- */
/* List params                                                                */
/* -------------------------------------------------------------------------- */

export const USER_SORT_KEYS = ["name", "role", "status", "employee_id", "joining_date", "created_at"] as const;
export type UserSortKey = (typeof USER_SORT_KEYS)[number];

export const USER_SORT_COLUMNS: Record<UserSortKey, string> = {
  name: "full_name",
  role: "role",
  status: "status",
  employee_id: "employee_id",
  joining_date: "joining_date",
  created_at: "created_at",
};

export const USER_ROLE_FILTERS = ["owner", "admin", "site_manager"] as const satisfies readonly AppRole[];
export const USER_STATUS_FILTERS = ["active", "inactive"] as const;

export const SM_SORT_KEYS = [
  "name",
  "assigned",
  "ongoing",
  "delayed",
  "on_time",
  "progress",
  "requests",
  "last_update",
] as const;
export type SiteManagerSortKey = (typeof SM_SORT_KEYS)[number];

export const ADMIN_SORT_KEYS = [
  "name",
  "assigned",
  "pending",
  "overdue",
  "completion",
  "response",
  "value",
] as const;
export type AdminSortKey = (typeof ADMIN_SORT_KEYS)[number];
