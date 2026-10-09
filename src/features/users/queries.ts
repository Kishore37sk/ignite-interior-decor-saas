import "server-only";
import { toFriendlyError } from "@/lib/errors";
import {
  ilikeAnyFilter,
  parseEnumParam,
  parseListParams,
  type SearchParamsRecord,
} from "@/lib/search-params";
import { fetchPage } from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";
import { nextEmployeeId } from "./employee-id";
import type {
  AdminPerformanceRow,
  AppRole,
  MaterialRequestDirectoryRow,
  MemberRole,
  MemberStatus,
  ProjectDirectoryRow,
  ProjectStatus,
  ProjectUpdate,
  SiteManagerPerformanceRow,
  UserStatus,
} from "@/types/database";
import {
  EMPLOYEE_ID_PREFIX,
  STAFF_ROLES,
  USER_ROLE_FILTERS,
  USER_SORT_COLUMNS,
  USER_SORT_KEYS,
  USER_STATUS_FILTERS,
  type StaffRole,
  type UserSortKey,
} from "./schemas";

export const PROFILE_COLUMNS =
  "id, full_name, email, phone, role, employee_id, status, joining_date, avatar_url, deactivated_at, created_at";

export type StaffProfile = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: AppRole | null;
  employee_id: string | null;
  status: UserStatus;
  joining_date: string | null;
  avatar_url: string | null;
  deactivated_at: string | null;
  created_at: string;
};

function failure(err: unknown, context: string, fallback: string): Error {
  return new Error(toFriendlyError(err, fallback, context));
}

/* -------------------------------------------------------------------------- */
/* /users list                                                                */
/* -------------------------------------------------------------------------- */

export type UserListFilters = {
  q: string;
  role: AppRole | undefined;
  status: UserStatus | undefined;
  page: number;
  pageSize: number;
  sort: UserSortKey;
  dir: "asc" | "desc";
};

export type UserListRow = StaffProfile & { assigned_projects: number };

export function parseUserListParams(params: SearchParamsRecord): UserListFilters {
  const list = parseListParams(params, {
    sortable: USER_SORT_KEYS,
    defaultSort: "created_at",
    defaultDir: "desc",
  });
  return {
    q: list.q,
    role: parseEnumParam(params, "role", USER_ROLE_FILTERS),
    status: parseEnumParam(params, "status", USER_STATUS_FILTERS),
    page: list.page,
    pageSize: list.pageSize,
    sort: list.sort,
    dir: list.dir,
  };
}

export async function listUsers(
  params: SearchParamsRecord,
): Promise<{ filters: UserListFilters; rows: UserListRow[]; total: number }> {
  const filters = parseUserListParams(params);
  const supabase = await createClient();
  const build = (head = false) => {
    let query = supabase.from("profiles").select(PROFILE_COLUMNS, { count: "exact", head });
    if (filters.role) query = query.eq("role", filters.role);
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.q) query = query.or(ilikeAnyFilter(["full_name", "email", "employee_id", "phone"], filters.q));
    return query;
  };

  const { rows: data, total, page, error } = await fetchPage(
    filters.page,
    filters.pageSize,
    (from, to) =>
      build()
        .order(USER_SORT_COLUMNS[filters.sort], { ascending: filters.dir === "asc", nullsFirst: false })
        .order("full_name", { ascending: true })
        .range(from, to),
    () => build(true),
  );
  if (error) throw failure(error, "users.list", "We couldn't load the user list.");
  const profiles = data as StaffProfile[];

  const counts = await activeAssignmentCounts(profiles.map((p) => p.id));
  return {
    filters: { ...filters, page },
    rows: profiles.map((p) => ({ ...p, assigned_projects: counts.get(p.id) ?? 0 })),
    total,
  };
}

/** Active project-assignment count per user id. */
export async function activeAssignmentCounts(userIds: readonly string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (userIds.length === 0) return counts;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("status", "active")
    .in("user_id", userIds as string[]);
  if (error) throw failure(error, "users.assignmentCounts", "We couldn't load project assignments.");
  for (const row of data ?? []) counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1);
  return counts;
}

/* -------------------------------------------------------------------------- */
/* Employee ID suggestions                                                    */
/* -------------------------------------------------------------------------- */

export type EmployeeIdSuggestions = Record<StaffRole, string>;

export async function getEmployeeIdSuggestions(): Promise<EmployeeIdSuggestions> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("employee_id").not("employee_id", "is", null);
  if (error) throw failure(error, "users.employeeIds", "We couldn't load employee IDs.");
  const ids = (data ?? []).map((row) => row.employee_id);
  return {
    site_manager: nextEmployeeId(EMPLOYEE_ID_PREFIX.site_manager, ids),
    admin: nextEmployeeId(EMPLOYEE_ID_PREFIX.admin, ids),
  };
}

/* -------------------------------------------------------------------------- */
/* Single profile                                                             */
/* -------------------------------------------------------------------------- */

export async function getStaffProfile(id: string): Promise<StaffProfile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw failure(error, "users.profile", "We couldn't load this user.");
  return (data as StaffProfile | null) ?? null;
}

export async function getProfilesByIds(ids: readonly string[]): Promise<Map<string, StaffProfile>> {
  const map = new Map<string, StaffProfile>();
  if (ids.length === 0) return map;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .in("id", ids as string[]);
  if (error) throw failure(error, "users.profilesByIds", "We couldn't load team profiles.");
  for (const row of (data ?? []) as StaffProfile[]) map.set(row.id, row);
  return map;
}

/* -------------------------------------------------------------------------- */
/* Performance                                                                */
/* -------------------------------------------------------------------------- */

export async function getSiteManagerPerformance(): Promise<SiteManagerPerformanceRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_site_manager_performance");
  if (error) throw failure(error, "users.smPerformance", "We couldn't load site manager metrics.");
  return (data ?? []) as SiteManagerPerformanceRow[];
}

export async function getAdminPerformance(): Promise<AdminPerformanceRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_admin_performance");
  if (error) throw failure(error, "users.adminPerformance", "We couldn't load admin metrics.");
  return (data ?? []) as AdminPerformanceRow[];
}

/* -------------------------------------------------------------------------- */
/* Assignments                                                                */
/* -------------------------------------------------------------------------- */

export type AssignmentRow = {
  id: string;
  project_id: string;
  member_role: MemberRole;
  status: MemberStatus;
  can_view_financials: boolean;
  assigned_at: string;
  removed_at: string | null;
  project: Pick<
    ProjectDirectoryRow,
    | "id"
    | "project_code"
    | "name"
    | "client_name"
    | "status"
    | "progress_percentage"
    | "deadline_date"
    | "deadline_state"
    | "archived_at"
  > | null;
};

const PROJECT_SUMMARY_COLUMNS =
  "id, project_code, name, client_name, status, progress_percentage, deadline_date, deadline_state, archived_at";

/** Every assignment (active and removed) of a user, newest first, with project summary. */
export async function getUserAssignments(userId: string): Promise<AssignmentRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_members")
    .select("id, project_id, member_role, status, can_view_financials, assigned_at, removed_at")
    .eq("user_id", userId)
    .order("assigned_at", { ascending: false })
    .limit(500);
  if (error) throw failure(error, "users.assignments", "We couldn't load project assignments.");
  const rows = data ?? [];
  const projectIds = Array.from(new Set(rows.map((r) => r.project_id)));
  const projects = await getProjectSummaries(projectIds);
  return rows.map((row) => ({
    ...row,
    status: row.status as MemberStatus,
    project: projects.get(row.project_id) ?? null,
  }));
}

export async function getProjectSummaries(ids: readonly string[]): Promise<Map<string, NonNullable<AssignmentRow["project"]>>> {
  const map = new Map<string, NonNullable<AssignmentRow["project"]>>();
  if (ids.length === 0) return map;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_directory")
    .select(PROJECT_SUMMARY_COLUMNS)
    .in("id", ids as string[]);
  if (error) throw failure(error, "users.projectSummaries", "We couldn't load project details.");
  for (const row of data ?? []) map.set(row.id, row);
  return map;
}

export type AssignableProject = {
  id: string;
  project_code: string;
  name: string;
  client_name: string;
  status: ProjectStatus;
  site_manager_name: string | null;
};

/** Non-archived projects the owner can assign people to. */
export async function listAssignableProjects(): Promise<AssignableProject[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_directory")
    .select("id, project_code, name, client_name, status, site_manager_name")
    .is("archived_at", null)
    .order("name", { ascending: true })
    .limit(1000);
  if (error) throw failure(error, "users.assignableProjects", "We couldn't load projects.");
  return data ?? [];
}

export type TeamOption = { id: string; full_name: string; employee_id: string | null };

/** Active users with the given role (team_directory only lists active users). */
export async function listActiveTeam(role: StaffRole): Promise<TeamOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("team_directory")
    .select("id, full_name, employee_id")
    .eq("role", role)
    .order("full_name", { ascending: true });
  if (error) throw failure(error, "users.activeTeam", "We couldn't load the team list.");
  return data ?? [];
}

/* -------------------------------------------------------------------------- */
/* Work history                                                               */
/* -------------------------------------------------------------------------- */

export type ProjectUpdateWithProject = Pick<
  ProjectUpdate,
  "id" | "project_id" | "status" | "previous_status" | "progress_percentage" | "previous_progress" | "update_date" | "issues" | "notes" | "created_at"
> & { project: AssignmentRow["project"] };

export async function getRecentProjectUpdates(userId: string, limit = 8): Promise<ProjectUpdateWithProject[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_updates")
    .select("id, project_id, status, previous_status, progress_percentage, previous_progress, update_date, issues, notes, created_at")
    .eq("updated_by", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw failure(error, "users.projectUpdates", "We couldn't load project updates.");
  const rows = data ?? [];
  const projects = await getProjectSummaries(Array.from(new Set(rows.map((r) => r.project_id))));
  return rows.map((row) => ({ ...row, project: projects.get(row.project_id) ?? null }));
}

export type RequestSummary = Pick<
  MaterialRequestDirectoryRow,
  | "id"
  | "request_code"
  | "title"
  | "status"
  | "priority"
  | "required_date"
  | "project_id"
  | "project_code"
  | "project_name"
  | "items_summary"
  | "requested_by_name"
  | "assigned_admin_name"
  | "created_at"
>;

const REQUEST_SUMMARY_COLUMNS =
  "id, request_code, title, status, priority, required_date, project_id, project_code, project_name, items_summary, requested_by_name, assigned_admin_name, created_at";

export async function getRequestsByUser(
  column: "requested_by" | "assigned_admin",
  userId: string,
  limit = 8,
): Promise<{ rows: RequestSummary[]; total: number }> {
  const supabase = await createClient();
  const { data, error, count } = await supabase
    .from("material_request_directory")
    .select(REQUEST_SUMMARY_COLUMNS, { count: "exact" })
    .eq(column, userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw failure(error, "users.requests", "We couldn't load material requests.");
  return { rows: data ?? [], total: count ?? 0 };
}

export function isStaffRole(role: AppRole | null | undefined): role is StaffRole {
  return role !== null && role !== undefined && (STAFF_ROLES as readonly string[]).includes(role);
}
