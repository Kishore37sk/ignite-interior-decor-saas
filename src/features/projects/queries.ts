import "server-only";
import { cache } from "react";
import type { ActivityItem } from "@/components/shared/activity-timeline";
import type { CurrentUser } from "@/lib/auth";
import {
  CLOSED_PROJECT_STATUSES,
  NEAR_DEADLINE_DAYS,
  ONGOING_PROJECT_STATUSES,
  PRIORITY_LEVELS,
  PROJECT_DOCUMENTS_BUCKET,
  PROJECT_STATUSES,
  UPCOMING_HANDOVER_DAYS,
} from "@/lib/constants";
import { addDays, todayIST } from "@/lib/dates";
import { logServerError, toFriendlyError } from "@/lib/errors";
import { fetchAllByIds, fetchAllRows, fetchPage } from "@/lib/pagination";
import {
  ilikeAnyFilter,
  parseDateRange,
  parseEnumParam,
  parseListParams,
  parseUuidParam,
  type DateRangeFilter,
  type SearchParamsRecord,
} from "@/lib/search-params";
import { createClient } from "@/lib/supabase/server";
import type {
  ActivityFeedRow,
  AppRole,
  DocumentCategory,
  MaterialRequestStatus,
  MemberRole,
  PriorityLevel,
  ProjectDirectoryRow,
  ProjectFinancialSummaryRow,
  ProjectMaterialSummaryRow,
  ProjectMilestone,
  ProjectStatus,
  ProjectUpdate,
  UserStatus,
} from "@/types/database";
import {
  PROJECT_ARCHIVE_FILTERS,
  PROJECT_SORT_COLUMNS,
  PROJECT_SORT_KEYS,
  PROJECT_VIEWS,
  type ProjectArchiveFilter,
  type ProjectSortKey,
  type ProjectView,
} from "./constants";

function loadError(error: unknown, message: string, context: string): Error {
  return new Error(toFriendlyError(error, message, context));
}

/* -------------------------------------------------------------------------- */
/* List                                                                       */
/* -------------------------------------------------------------------------- */

export type ProjectListFilters = {
  q: string;
  view: ProjectView | undefined;
  status: ProjectStatus | undefined;
  sm: string | undefined;
  priority: PriorityLevel | undefined;
  client: string | undefined;
  archived: ProjectArchiveFilter | undefined;
  range: DateRangeFilter;
  page: number;
  pageSize: number;
  sort: ProjectSortKey;
  dir: "asc" | "desc";
};

export type ProjectMaterialCost = {
  estimated: number;
  approved: number;
  actual: number;
  variance: number;
};

export type ProjectListResult = {
  filters: ProjectListFilters;
  rows: ProjectDirectoryRow[];
  total: number;
  /** Owner only: project id → material costs (project_financial_summary). */
  materialCosts: Map<string, ProjectMaterialCost> | null;
};

export function parseProjectListParams(params: SearchParamsRecord, role: AppRole): ProjectListFilters {
  const list = parseListParams(params, {
    sortable: PROJECT_SORT_KEYS,
    defaultSort: "updated_at",
    defaultDir: "desc",
    defaultPageSize: role === "site_manager" ? 12 : undefined,
  });
  return {
    q: list.q,
    view: parseEnumParam(params, "view", PROJECT_VIEWS),
    status: parseEnumParam(params, "status", PROJECT_STATUSES),
    sm: parseUuidParam(params, "sm"),
    priority: parseEnumParam(params, "priority", PRIORITY_LEVELS),
    client: parseUuidParam(params, "client"),
    archived: role === "owner" ? parseEnumParam(params, "archived", PROJECT_ARCHIVE_FILTERS) : undefined,
    range: parseDateRange(params),
    page: list.page,
    pageSize: list.pageSize,
    sort: list.sort,
    dir: list.dir,
  };
}

const CLOSED_LIST = `(${CLOSED_PROJECT_STATUSES.join(",")})`;

export async function listProjects(params: SearchParamsRecord, user: CurrentUser): Promise<ProjectListResult> {
  const filters = parseProjectListParams(params, user.role);
  const supabase = await createClient();
  const today = todayIST();
  const build = (head = false) => {
    let query = supabase.from("project_directory").select("*", { count: "exact", head });
    if (filters.q) query = query.or(ilikeAnyFilter(["name", "project_code", "client_name", "city"], filters.q));
    if (filters.status) query = query.eq("status", filters.status);
    switch (filters.view) {
      case "ongoing":
        query = query.in("status", [...ONGOING_PROJECT_STATUSES]);
        break;
      case "completed":
        query = query.eq("status", "completed");
        break;
      case "delayed":
        query = query.or("is_overdue.eq.true,status.eq.delayed");
        break;
      case "upcoming_handover": {
        // Same rule as get_owner_dashboard.upcoming_handovers and the dashboard widget:
        // coalesce(handover_date, expected_completion_date) within the next 30 days, not closed.
        query = query
          .gte("handover_or_deadline", today)
          .lte("handover_or_deadline", addDays(today, UPCOMING_HANDOVER_DAYS))
          .not("status", "in", CLOSED_LIST);
        break;
      }
      case "near_deadline":
        // Same rule as get_site_manager_dashboard.near_deadline: due within 14 days, not closed.
        query = query
          .gte("expected_completion_date", today)
          .lte("expected_completion_date", addDays(today, NEAR_DEADLINE_DAYS))
          .not("status", "in", CLOSED_LIST);
        break;
      case "on_hold":
        query = query.eq("status", "on_hold");
        break;
      case "closed":
        query = query.in("status", [...CLOSED_PROJECT_STATUSES]);
        break;
      default:
        break;
    }
    if (filters.sm) query = query.contains("site_manager_ids", `{${filters.sm}}`);
    if (filters.priority) query = query.eq("priority", filters.priority);
    if (filters.client) query = query.eq("client_id", filters.client);
    if (filters.range.from) query = query.gte("expected_completion_date", filters.range.from);
    if (filters.range.to) query = query.lte("expected_completion_date", filters.range.to);
    if (filters.archived === "only") query = query.not("archived_at", "is", null);
    else if (filters.archived !== "include") query = query.is("archived_at", null);
    return query;
  };

  const {
    rows: data,
    total,
    page,
    error,
  } = await fetchPage(
    filters.page,
    filters.pageSize,
    (from, to) =>
      build()
        .order(PROJECT_SORT_COLUMNS[filters.sort], { ascending: filters.dir === "asc", nullsFirst: false })
        .order("id", { ascending: true })
        .range(from, to),
    () => build(true),
  );
  if (error) throw loadError(error, "We couldn't load projects.", "projects.list");
  const rows = data;

  let materialCosts: Map<string, ProjectMaterialCost> | null = null;
  if (user.role === "owner" && rows.length > 0) {
    const { data: fin, error: finError } = await supabase
      .from("project_financial_summary")
      .select("project_id, material_estimated_cost, material_approved_cost, material_actual_cost, material_variance")
      .in(
        "project_id",
        rows.map((row) => row.id),
      );
    if (finError) {
      logServerError("projects.list.costs", finError);
    } else {
      materialCosts = new Map(
        (fin ?? []).map((row) => [
          row.project_id,
          {
            estimated: Number(row.material_estimated_cost ?? 0),
            approved: Number(row.material_approved_cost ?? 0),
            actual: Number(row.material_actual_cost ?? 0),
            variance: Number(row.material_variance ?? 0),
          },
        ]),
      );
    }
  }

  return { filters: { ...filters, page }, rows, total, materialCosts };
}

/* -------------------------------------------------------------------------- */
/* People                                                                     */
/* -------------------------------------------------------------------------- */

export type TeamOption = { id: string; full_name: string; employee_id: string | null; role: AppRole | null };

/** Active users with a role (team_directory), e.g. site managers for filters and pickers. */
export async function listTeamOptions(roles: readonly AppRole[]): Promise<TeamOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("team_directory")
    .select("id, full_name, employee_id, role")
    .in("role", [...roles])
    .order("full_name", { ascending: true })
    .limit(1000);
  if (error) {
    logServerError("projects.teamOptions", error);
    return [];
  }
  return data ?? [];
}

export type PersonInfo = { name: string; status: UserStatus; employeeId: string | null; avatarUrl: string | null };

/**
 * Display names for user ids. team_directory only lists active users, so the owner
 * additionally reads profiles to name deactivated people.
 */
export async function resolvePeople(ids: readonly (string | null | undefined)[], user: CurrentUser): Promise<Map<string, PersonInfo>> {
  const unique = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
  const out = new Map<string, PersonInfo>();
  if (unique.length === 0) return out;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("team_directory")
    .select("id, full_name, status, employee_id, avatar_url")
    .in("id", unique);
  if (error) logServerError("projects.resolvePeople", error);
  for (const row of data ?? []) {
    out.set(row.id, { name: row.full_name, status: row.status, employeeId: row.employee_id, avatarUrl: row.avatar_url });
  }
  const missing = unique.filter((id) => !out.has(id));
  if (missing.length > 0 && user.role === "owner") {
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, status, employee_id, avatar_url")
      .in("id", missing);
    if (profileError) logServerError("projects.resolvePeople.profiles", profileError);
    for (const row of profiles ?? []) {
      out.set(row.id, { name: row.full_name, status: row.status, employeeId: row.employee_id, avatarUrl: row.avatar_url });
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Project detail                                                             */
/* -------------------------------------------------------------------------- */

/** One project (project_directory, RLS-scoped); cached per request so metadata + page share a query. */
/**
 * Whether the signed-in user is an active member of the project (any member role).
 * Admins usually reach projects through material requests rather than membership, and
 * project_updates / project_documents RLS only shows rows to the owner and members.
 */
export const isActiveProjectMember = cache(async (projectId: string): Promise<boolean> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_project_member", { p: projectId });
  if (error) {
    logServerError("projects.isMember", error);
    return false;
  }
  return data === true;
});

export const getProject = cache(async (id: string): Promise<ProjectDirectoryRow | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("project_directory").select("*").eq("id", id).maybeSingle();
  if (error) throw loadError(error, "We couldn't load this project.", "projects.get");
  return data;
});

/** Financial summary — RLS returns a row only for the owner or members granted financial access. */
export async function getProjectFinancials(id: string): Promise<ProjectFinancialSummaryRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_financial_summary")
    .select(
      "project_id, project_code, project_name, client_id, client_name, project_cost, advance_received, material_estimated_cost, material_approved_cost, material_actual_cost, material_variance, material_variance_estimated_cost, material_variance_actual_cost, status, archived_at, payment_count, last_payment_on",
    )
    .eq("project_id", id)
    .maybeSingle();
  if (error) {
    logServerError("projects.financials", error);
    return null;
  }
  return data;
}

export async function getProjectMilestones(projectId: string): Promise<ProjectMilestone[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_milestones")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });
  if (error) throw loadError(error, "We couldn't load the project timeline.", "projects.milestones");
  return data ?? [];
}

export async function listProjectUpdates(
  projectId: string,
  limit: number,
): Promise<{ rows: ProjectUpdate[]; total: number }> {
  const supabase = await createClient();
  const { data, count, error } = await supabase
    .from("project_updates")
    .select("*", { count: "exact" })
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .range(0, limit - 1);
  if (error) throw loadError(error, "We couldn't load progress updates.", "projects.updates");
  return { rows: data ?? [], total: count ?? 0 };
}

export type TeamMember = {
  userId: string;
  memberRole: MemberRole;
  canViewFinancials: boolean;
  assignedAt: string | null;
  person: PersonInfo | null;
};

/**
 * Active project members. The owner reads project_members (RLS: owner sees all rows);
 * everyone else gets the site managers listed on project_directory.
 */
export async function getProjectTeam(project: ProjectDirectoryRow, user: CurrentUser): Promise<TeamMember[]> {
  if (user.role !== "owner") {
    const people = await resolvePeople(project.site_manager_ids, user);
    return project.site_manager_ids.map((userId) => ({
      userId,
      memberRole: "site_manager" as const,
      canViewFinancials: false,
      assignedAt: null,
      person:
        people.get(userId) ??
        (userId === project.site_manager_id && project.site_manager_name
          ? { name: project.site_manager_name, status: "active" as const, employeeId: null, avatarUrl: null }
          : null),
    }));
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_members")
    .select("user_id, member_role, can_view_financials, assigned_at")
    .eq("project_id", project.id)
    .eq("status", "active")
    .order("assigned_at", { ascending: true });
  if (error) throw loadError(error, "We couldn't load the project team.", "projects.team");
  const rows = data ?? [];
  const people = await resolvePeople(
    rows.map((row) => row.user_id),
    user,
  );
  return rows.map((row) => ({
    userId: row.user_id,
    memberRole: row.member_role,
    canViewFinancials: row.can_view_financials,
    assignedAt: row.assigned_at,
    person: people.get(row.user_id) ?? null,
  }));
}

/* -------------------------------------------------------------------------- */
/* Requests & materials                                                       */
/* -------------------------------------------------------------------------- */

export type ProjectRequestRow = {
  id: string;
  request_code: string;
  title: string;
  project_name: string;
  project_code: string;
  status: MaterialRequestStatus;
  priority: PriorityLevel;
  required_date: string;
  items_summary: string | null;
  item_count: number;
  requested_by_name: string | null;
  assigned_admin_name: string | null;
  estimated_cost?: number | null;
  approved_cost?: number | null;
  actual_cost?: number | null;
};

const REQUEST_COLUMNS =
  "id, request_code, title, project_name, project_code, status, priority, required_date, items_summary, item_count, requested_by_name, assigned_admin_name";

/** Material requests (material_request_directory, RLS-scoped). Costs only when `withCosts`. */
export async function listRequests(
  filter: { column: "project_id" | "client_id"; value: string },
  options: { page: number; pageSize: number; withCosts: boolean },
): Promise<{ rows: ProjectRequestRow[]; total: number }> {
  const supabase = await createClient();
  const from = (options.page - 1) * options.pageSize;
  const columns = options.withCosts ? `${REQUEST_COLUMNS}, estimated_cost, approved_cost, actual_cost` : REQUEST_COLUMNS;
  const { data, count, error } = await supabase
    .from("material_request_directory")
    .select(columns, { count: "exact" })
    .eq(filter.column, filter.value)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .range(from, from + options.pageSize - 1)
    .overrideTypes<ProjectRequestRow[], { merge: false }>();
  if (error) throw loadError(error, "We couldn't load material requests.", "projects.requests");
  return { rows: data ?? [], total: count ?? 0 };
}

export type MaterialLine = {
  key: string;
  materialName: string;
  category: string | null;
  unit: string;
  quantity: number;
  delivered: number;
  requestCodes: { id: string; code: string }[];
  /** "delivered" | "partial" | "pending" | "cancelled" */
  state: "delivered" | "partial" | "pending" | "cancelled";
};

export type ProjectMaterials = {
  summary: ProjectMaterialSummaryRow | null;
  lines: MaterialLine[];
};

const INACTIVE_REQUEST: ReadonlySet<MaterialRequestStatus> = new Set(["rejected", "cancelled"]);

/** Material KPIs + aggregated requirement lines ("Cement 100 Bags Delivered"). */
export async function getProjectMaterials(projectId: string, withCosts: boolean): Promise<ProjectMaterials> {
  const supabase = await createClient();
  const summaryColumns = withCosts
    ? "project_id, total_requests, pending_requests, approved_requests, ordered_requests, delivered_requests, pending_material_cost, approved_material_cost, actual_material_cost"
    : "project_id, total_requests, pending_requests, approved_requests, ordered_requests, delivered_requests";

  const [summaryResult, requestsResult] = await Promise.all([
    supabase
      .from("project_material_summary")
      .select(summaryColumns)
      .eq("project_id", projectId)
      .maybeSingle()
      .overrideTypes<ProjectMaterialSummaryRow, { merge: false }>(),
    // Every request and item is read (paged past PostgREST's 1000-row cap; request ids go
    // into `.in()` in small chunks) so the aggregated quantities are never under-counted.
    fetchAllRows((from, to) =>
      supabase
        .from("material_request_directory")
        .select("id, request_code, status")
        .eq("project_id", projectId)
        .is("archived_at", null)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);
  if (summaryResult.error) throw loadError(summaryResult.error, "We couldn't load material totals.", "projects.materials.summary");
  if (requestsResult.error) throw loadError(requestsResult.error, "We couldn't load materials.", "projects.materials.requests");

  const requests = requestsResult.rows;
  const lines: MaterialLine[] = [];
  if (requests.length > 0) {
    const { rows: fetchedItems, error } = await fetchAllByIds(
      requests.map((r) => r.id),
      (chunkIds, from, to) =>
        supabase
          .from("material_request_items")
          .select("id, request_id, material_name, category, quantity, unit, delivered_quantity, created_at")
          .in("request_id", chunkIds)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
    );
    if (error) throw loadError(error, "We couldn't load material items.", "projects.materials.items");
    const items = [...fetchedItems].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));

    const requestById = new Map(requests.map((r) => [r.id, r]));
    const grouped = new Map<string, MaterialLine & { activeQty: number }>();
    for (const item of items) {
      const request = requestById.get(item.request_id);
      if (!request) continue;
      const key = `${item.material_name.trim().toLowerCase()}|${item.unit.trim().toLowerCase()}`;
      const line =
        grouped.get(key) ??
        ({
          key,
          materialName: item.material_name.trim(),
          category: item.category,
          unit: item.unit,
          quantity: 0,
          delivered: 0,
          activeQty: 0,
          requestCodes: [],
          state: "pending",
        } satisfies MaterialLine & { activeQty: number });
      const inactive = INACTIVE_REQUEST.has(request.status);
      if (!inactive) {
        line.quantity += Number(item.quantity);
        line.activeQty += Number(item.quantity);
      }
      line.delivered += Number(item.delivered_quantity ?? 0);
      if (!line.requestCodes.some((r) => r.id === request.id)) {
        line.requestCodes.push({ id: request.id, code: request.request_code });
      }
      grouped.set(key, line);
    }
    for (const line of grouped.values()) {
      const { activeQty, ...rest } = line;
      let state: MaterialLine["state"];
      if (activeQty === 0) state = "cancelled";
      else if (rest.delivered >= activeQty) state = "delivered";
      else if (rest.delivered > 0) state = "partial";
      else state = "pending";
      lines.push({ ...rest, state });
    }
  }

  return { summary: summaryResult.data ?? null, lines };
}

/* -------------------------------------------------------------------------- */
/* Documents                                                                  */
/* -------------------------------------------------------------------------- */

export type ProjectDocumentItem = {
  id: string;
  category: DocumentCategory;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  uploadedBy: string | null;
  uploaderName: string | null;
  thumbnailUrl: string | null;
};

const THUMBNAIL_TTL_SECONDS = 600;

export async function listProjectDocuments(projectId: string, user: CurrentUser): Promise<ProjectDocumentItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_documents")
    .select("id, category, file_name, storage_path, mime_type, size_bytes, uploaded_by, created_at")
    .eq("project_id", projectId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw loadError(error, "We couldn't load project documents.", "projects.documents");
  const rows = data ?? [];

  const imagePaths = rows
    .filter((row) => row.mime_type?.startsWith("image/") && !/heic|heif/i.test(row.mime_type))
    .map((row) => row.storage_path);
  const urls = new Map<string, string>();
  if (imagePaths.length > 0) {
    const { data: signed, error: signError } = await supabase.storage
      .from(PROJECT_DOCUMENTS_BUCKET)
      .createSignedUrls(imagePaths, THUMBNAIL_TTL_SECONDS);
    if (signError) logServerError("projects.documents.thumbnails", signError);
    for (const item of signed ?? []) {
      if (item.path && item.signedUrl && !item.error) urls.set(item.path, item.signedUrl);
    }
  }

  const people = await resolvePeople(
    rows.map((row) => row.uploaded_by),
    user,
  );
  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    uploadedBy: row.uploaded_by,
    uploaderName: row.uploaded_by ? (people.get(row.uploaded_by)?.name ?? null) : null,
    thumbnailUrl: urls.get(row.storage_path) ?? null,
  }));
}

/* -------------------------------------------------------------------------- */
/* Activity                                                                   */
/* -------------------------------------------------------------------------- */

export type ActivityRow = Pick<
  ActivityFeedRow,
  "id" | "user_id" | "actor_name" | "summary" | "entity_type" | "entity_id" | "action" | "created_at"
>;

/** activity_feed rows (audit RLS applies) for a set of projects, newest first. */
export async function listActivity(
  filter: { projectIds: readonly string[]; clientId?: string },
  limit: number,
): Promise<{ rows: ActivityRow[]; hasMore: boolean }> {
  if (filter.projectIds.length === 0 && !filter.clientId) return { rows: [], hasMore: false };
  const supabase = await createClient();
  const parts: string[] = [];
  if (filter.projectIds.length > 0) parts.push(`project_id.in.(${filter.projectIds.join(",")})`);
  if (filter.clientId) parts.push(`and(entity_type.eq.clients,entity_id.eq.${filter.clientId})`);
  const { data, error } = await supabase
    .from("activity_feed")
    .select("id, user_id, actor_name, summary, entity_type, entity_id, action, created_at")
    .or(parts.join(","))
    .order("created_at", { ascending: false })
    .range(0, limit);
  if (error) throw loadError(error, "We couldn't load activity.", "projects.activity");
  const rows = data ?? [];
  return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

/** Link for an activity row (material requests open their own page). */
function activityHref(row: Pick<ActivityRow, "entity_type" | "entity_id">): string | null {
  if (!row.entity_id) return null;
  if (row.entity_type === "material_requests") return `/material-requests/${row.entity_id}`;
  return null;
}

/** activity_feed rows → ActivityTimeline items. */
export function toActivityItems(rows: readonly ActivityRow[]): ActivityItem[] {
  return rows.map((row) => ({
    id: row.id,
    actorName: row.actor_name,
    actorId: row.user_id,
    summary: row.summary ?? `${row.action} ${row.entity_type}`,
    createdAt: row.created_at,
    entityType: row.entity_type,
    href: activityHref(row),
  }));
}
