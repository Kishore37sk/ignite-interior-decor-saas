import "server-only";
import type { ActivityItem } from "@/components/shared/activity-timeline";
import type { CurrentUser } from "@/lib/auth";
import {
  CLOSED_PROJECT_STATUSES,
  MATERIAL_CLOSED_STATUSES,
  MATERIAL_OPEN_STATUSES,
  MATERIAL_PENDING_STATUSES,
  MATERIAL_PROCESSING_STATUSES,
  MATERIAL_REQUEST_STATUSES,
  PRIORITY_LEVELS,
} from "@/lib/constants";
import { logServerError, toFriendlyError } from "@/lib/errors";
import { fetchAllByIds, fetchAllRows, fetchPage, lastPageFor, rangeOf } from "@/lib/pagination";
import {
  getParam,
  ilikeAnyFilter,
  pageRange,
  parseDateRange,
  parseEnumParam,
  parseListParams,
  parseUuidParam,
  type DateRangeFilter,
  type SearchParamsRecord,
} from "@/lib/search-params";
import { createClient } from "@/lib/supabase/server";
import type {
  AppRole,
  Material,
  MaterialDelivery,
  MaterialRequestComment,
  MaterialRequestDirectoryRow,
  MaterialRequestItem,
  MaterialRequestStatus,
  PriorityLevel,
  ProjectMaterialSummaryRow,
  ProjectStatus,
} from "@/types/database";
import {
  CATALOG_ACTIVE_FILTERS,
  REQUEST_SORT_KEYS,
  REQUEST_VIEWS,
  REQUIREMENT_STATUS_FILTERS,
  REQUIREMENT_STATUS_GROUPS,
  type CatalogActiveFilter,
  type RequestSortKey,
  type RequestView,
  type RequirementStatusFilter,
} from "./constants";

type Supabase = Awaited<ReturnType<typeof createClient>>;

function loadError(error: unknown, message: string, context: string): Error {
  return new Error(toFriendlyError(error, message, context));
}

const inList = (values: readonly string[]) => `(${values.join(",")})`;

/* -------------------------------------------------------------------------- */
/* Request list                                                               */
/* -------------------------------------------------------------------------- */

export type RequestListFilters = {
  q: string;
  view: RequestView | undefined;
  status: MaterialRequestStatus | undefined;
  priority: PriorityLevel | undefined;
  admin: string | undefined;
  sm: string | undefined;
  project: string | undefined;
  client: string | undefined;
  range: DateRangeFilter;
  page: number;
  pageSize: number;
  sort: RequestSortKey;
  dir: "asc" | "desc";
};

export type RequestListResult = {
  filters: RequestListFilters;
  rows: MaterialRequestDirectoryRow[];
  total: number;
};

export function parseRequestListParams(params: SearchParamsRecord): RequestListFilters {
  const list = parseListParams(params, { sortable: REQUEST_SORT_KEYS, defaultSort: "urgency", defaultDir: "asc" });
  return {
    q: list.q,
    view: parseEnumParam(params, "view", REQUEST_VIEWS),
    status: parseEnumParam(params, "status", MATERIAL_REQUEST_STATUSES),
    priority: parseEnumParam(params, "priority", PRIORITY_LEVELS),
    admin: parseUuidParam(params, "admin"),
    sm: parseUuidParam(params, "sm"),
    project: parseUuidParam(params, "project"),
    client: parseUuidParam(params, "client"),
    range: parseDateRange(params),
    page: list.page,
    pageSize: list.pageSize,
    sort: list.sort,
    dir: list.dir,
  };
}

/** Display name for the `?client=` filter chip (null when the client isn't visible to the user). */
export async function getClientFilterLabel(clientId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("clients").select("name, client_code").eq("id", clientId).maybeSingle();
  if (error) {
    logServerError("materials.clientFilterLabel", error);
    return null;
  }
  return data ? `${data.name} (${data.client_code})` : null;
}

export async function listMaterialRequests(params: SearchParamsRecord, user: CurrentUser): Promise<RequestListResult> {
  const filters = parseRequestListParams(params);
  const supabase = await createClient();
  const { from, to } = pageRange(filters.page, filters.pageSize);
  const base = (head = false) => supabase.from("material_request_directory").select("*", { count: "exact", head });
  type DirectoryQuery = ReturnType<typeof base>;

  /** Apply every list filter (shared by the count and page queries). */
  const applyRequestFilters = (query: DirectoryQuery, f: RequestListFilters, u: CurrentUser): DirectoryQuery => {
    let q = query.is("archived_at", null);
    if (f.q) {
      q = q.or(ilikeAnyFilter(["request_code", "title", "items_summary", "project_name", "project_code"], f.q));
    }
    if (f.status) q = q.eq("status", f.status);
    if (f.priority) q = q.eq("priority", f.priority);
    if (f.admin) q = q.eq("assigned_admin", f.admin);
    if (f.sm) q = q.eq("requested_by", f.sm);
    if (f.project) q = q.eq("project_id", f.project);
    if (f.client) q = q.eq("client_id", f.client);
    if (f.range.from) q = q.gte("required_date", f.range.from);
    if (f.range.to) q = q.lte("required_date", f.range.to);
    switch (f.view) {
      case "open":
        q = q.in("status", [...MATERIAL_OPEN_STATUSES]);
        break;
      case "pending":
        q = q.in("status", [...MATERIAL_PENDING_STATUSES]);
        break;
      case "processing":
        q = q.in("status", [...MATERIAL_PROCESSING_STATUSES]);
        break;
      case "completed":
        q = q.eq("status", "delivered");
        break;
      case "overdue":
        q = q.eq("required_state", "overdue");
        break;
      case "unassigned":
        q = q.is("assigned_admin", null).in("status", [...MATERIAL_OPEN_STATUSES]);
        break;
      case "mine":
        q = u.role === "admin" ? q.eq("assigned_admin", u.id) : q.eq("requested_by", u.id);
        break;
      default:
        break;
    }
    return q;
  };

  if (filters.sort !== "urgency") {
    const column = filters.sort;
    const ascending = filters.dir === "asc";
    let query = applyRequestFilters(base(), filters, user).order(column, { ascending, nullsFirst: false });
    if (column !== "required_date") query = query.order("required_date", { ascending: true });
    const { data, error, count } = await query.order("id").range(from, to);
    if (error && error.code === "PGRST103") {
      // Page beyond the last row (e.g. a stale link): report the real total with no rows.
      const { count: totalCount } = await applyRequestFilters(base(true), filters, user);
      return { filters, rows: [], total: totalCount ?? 0 };
    }
    if (error) throw loadError(error, "We couldn't load material requests.", "materials.list");
    return { filters, rows: (data ?? []) as MaterialRequestDirectoryRow[], total: count ?? 0 };
  }

  // Urgency: open requests (soonest required date, then highest priority) before closed ones
  // (most recently updated). Two segments are paged as one continuous list.
  const openStatuses = inList(MATERIAL_OPEN_STATUSES);
  const head = () => base(true);
  const [openCount, closedCount] = await Promise.all([
    applyRequestFilters(head(), filters, user).in("status", [...MATERIAL_OPEN_STATUSES]),
    applyRequestFilters(head(), filters, user).not("status", "in", openStatuses),
  ]);
  if (openCount.error) throw loadError(openCount.error, "We couldn't load material requests.", "materials.list.count");
  if (closedCount.error) throw loadError(closedCount.error, "We couldn't load material requests.", "materials.list.count");
  const openTotal = openCount.count ?? 0;
  const closedTotal = closedCount.count ?? 0;
  const total = openTotal + closedTotal;

  const rows: MaterialRequestDirectoryRow[] = [];
  if (from < openTotal) {
    const { data, error } = await applyRequestFilters(base(), filters, user)
      .in("status", [...MATERIAL_OPEN_STATUSES])
      .order("required_date", { ascending: true })
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true })
      .order("id")
      .range(from, Math.min(to, openTotal - 1));
    if (error) throw loadError(error, "We couldn't load material requests.", "materials.list.open");
    rows.push(...((data ?? []) as MaterialRequestDirectoryRow[]));
  }
  if (to >= openTotal && closedTotal > 0) {
    const closedFrom = Math.max(0, from - openTotal);
    const closedTo = Math.min(to - openTotal, closedTotal - 1);
    if (closedFrom <= closedTo) {
      const { data, error } = await applyRequestFilters(base(), filters, user)
        .not("status", "in", openStatuses)
        .order("updated_at", { ascending: false })
        .order("id")
        .range(closedFrom, closedTo);
      if (error) throw loadError(error, "We couldn't load material requests.", "materials.list.closed");
      rows.push(...((data ?? []) as MaterialRequestDirectoryRow[]));
    }
  }
  return { filters, rows, total };
}

/* -------------------------------------------------------------------------- */
/* Options                                                                    */
/* -------------------------------------------------------------------------- */

export type PersonOption = { id: string; full_name: string; employee_id: string | null };

/** Active team members of a role (team_directory exposes no contact details). */
export async function listPeople(role: AppRole): Promise<PersonOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("team_directory")
    .select("id, full_name, employee_id")
    .eq("role", role)
    .order("full_name")
    .limit(500);
  if (error) throw loadError(error, "We couldn't load the team list.", "materials.people");
  return data ?? [];
}

export type ProjectOption = {
  id: string;
  name: string;
  project_code: string;
  client_name: string;
  status: ProjectStatus;
  archived_at: string | null;
};

/** Projects visible to the user (RLS), for filters. */
export async function listProjectOptions(): Promise<ProjectOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_directory")
    .select("id, name, project_code, client_name, status, archived_at")
    .order("name")
    .limit(500);
  if (error) throw loadError(error, "We couldn't load projects.", "materials.projectOptions");
  return data ?? [];
}

/** Open, non-archived projects the user may raise requests for. */
export async function listRequestableProjects(user: CurrentUser): Promise<ProjectOption[]> {
  const supabase = await createClient();
  let query = supabase
    .from("project_directory")
    .select("id, name, project_code, client_name, status, archived_at")
    .is("archived_at", null)
    .not("status", "in", inList(CLOSED_PROJECT_STATUSES))
    .order("name")
    .limit(500);
  if (user.role === "site_manager") query = query.contains("site_manager_ids", [user.id]);
  const { data, error } = await query;
  if (error) throw loadError(error, "We couldn't load your projects.", "materials.requestableProjects");
  return data ?? [];
}

export type CatalogOption = Pick<Material, "id" | "name" | "category" | "unit">;

export async function listActiveCatalog(): Promise<CatalogOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("materials")
    .select("id, name, category, unit")
    .eq("is_active", true)
    .order("name")
    .limit(1000);
  if (error) throw loadError(error, "We couldn't load the materials catalog.", "materials.catalogOptions");
  return data ?? [];
}

export async function listCategoryNames(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("material_categories")
    .select("name")
    .eq("is_active", true)
    .order("sort_order")
    .order("name");
  if (error) throw loadError(error, "We couldn't load material categories.", "materials.categories");
  return (data ?? []).map((row) => row.name);
}

/* -------------------------------------------------------------------------- */
/* Request detail                                                             */
/* -------------------------------------------------------------------------- */

export type CommentView = MaterialRequestComment & { authorName: string; authorRole: AppRole | null };
export type DeliveryView = MaterialDelivery & { recordedByName: string; itemName: string; unit: string };

export type RequestDetail = {
  request: MaterialRequestDirectoryRow;
  items: MaterialRequestItem[];
  deliveries: DeliveryView[];
  comments: CommentView[];
  activity: ActivityItem[];
};

const FORMER_MEMBER = "Former team member";

async function namesFor(supabase: Supabase, ids: readonly string[]) {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const map = new Map<string, { name: string; role: AppRole | null }>();
  if (unique.length === 0) return map;
  const { data, error } = await supabase.from("team_directory").select("id, full_name, role").in("id", unique);
  if (error) throw loadError(error, "We couldn't load team names.", "materials.names");
  for (const row of data ?? []) map.set(row.id, { name: row.full_name, role: row.role });
  return map;
}

export async function getRequestDetail(id: string): Promise<RequestDetail | null> {
  const supabase = await createClient();
  const { data: request, error } = await supabase
    .from("material_request_directory")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw loadError(error, "We couldn't load this material request.", "materials.detail");
  if (!request) return null;

  const [itemsRes, deliveriesRes, commentsRes, activityRes] = await Promise.all([
    // Approved / actual unit costs aren't selectable from the base table; the view masks them.
    supabase
      .from("material_request_item_directory")
      .select("*")
      .eq("request_id", id)
      .order("created_at")
      .order("id"),
    supabase
      .from("material_deliveries")
      .select("*")
      .eq("request_id", id)
      .order("delivery_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("material_request_comments")
      .select("*")
      .eq("request_id", id)
      .order("created_at")
      .limit(300),
    supabase
      .from("activity_feed")
      .select("id, user_id, actor_name, summary, entity_type, created_at")
      .filter("metadata->>request_id", "eq", id)
      .order("created_at", { ascending: false })
      .limit(40),
  ]);
  if (itemsRes.error) throw loadError(itemsRes.error, "We couldn't load the requested items.", "materials.detail.items");
  if (deliveriesRes.error) throw loadError(deliveriesRes.error, "We couldn't load deliveries.", "materials.detail.deliveries");
  if (commentsRes.error) throw loadError(commentsRes.error, "We couldn't load comments.", "materials.detail.comments");
  if (activityRes.error) throw loadError(activityRes.error, "We couldn't load activity.", "materials.detail.activity");

  const items = itemsRes.data ?? [];
  const deliveries = deliveriesRes.data ?? [];
  const comments = commentsRes.data ?? [];
  const names = await namesFor(supabase, [
    ...comments.map((c) => c.author_id),
    ...deliveries.map((d) => d.recorded_by ?? ""),
  ]);
  const itemById = new Map(items.map((item) => [item.id, item]));

  return {
    request: request as MaterialRequestDirectoryRow,
    items,
    deliveries: deliveries.map((d) => ({
      ...d,
      recordedByName: d.recorded_by ? (names.get(d.recorded_by)?.name ?? FORMER_MEMBER) : "—",
      itemName: itemById.get(d.item_id)?.material_name ?? "Removed item",
      unit: itemById.get(d.item_id)?.unit ?? "",
    })),
    comments: comments.map((c) => ({
      ...c,
      authorName: names.get(c.author_id)?.name ?? FORMER_MEMBER,
      authorRole: names.get(c.author_id)?.role ?? null,
    })),
    activity: (activityRes.data ?? []).map((row) => ({
      id: row.id,
      actorName: row.actor_name,
      actorId: row.user_id,
      summary: row.summary ?? "Updated the request",
      createdAt: row.created_at,
      entityType: row.entity_type,
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Requirements (project-level, /materials?tab=requirements)                  */
/* -------------------------------------------------------------------------- */

export type RequirementFilters = {
  q: string;
  project: string | undefined;
  status: RequirementStatusFilter | undefined;
  page: number;
  pageSize: number;
};

export type RequirementLine = {
  id: string;
  materialName: string;
  category: string | null;
  quantity: number;
  deliveredQuantity: number;
  unit: string;
  requestId: string;
  requestCode: string;
  status: MaterialRequestStatus;
  requiredDate: string;
};

export type ProjectRequirements = {
  project: ProjectOption & { site_manager_name: string | null };
  summary: ProjectMaterialSummaryRow | null;
  lines: RequirementLine[];
};

export type RequirementsResult = {
  filters: RequirementFilters;
  projects: ProjectRequirements[];
  total: number;
  /** The requested page is past the last row (stale link). */
  outOfRange?: boolean;
};

export function parseRequirementParams(params: SearchParamsRecord): RequirementFilters {
  const list = parseListParams(params, { sortable: ["name"] as const, defaultSort: "name", defaultPageSize: 10 });
  return {
    q: list.q,
    project: parseUuidParam(params, "project"),
    status: parseEnumParam(params, "status", REQUIREMENT_STATUS_FILTERS),
    page: list.page,
    pageSize: Math.min(list.pageSize, 50),
  };
}

/** Which project_material_summary counters make a project match a requirement status group. */
type SummaryCounts = Pick<
  ProjectMaterialSummaryRow,
  "project_id" | "total_requests" | "pending_requests" | "approved_requests" | "ordered_requests" | "delivered_requests"
>;

function matchesStatusGroup(row: SummaryCounts, status: RequirementStatusFilter): boolean {
  switch (status) {
    case "pending":
      return row.pending_requests > 0;
    case "approved":
      return row.approved_requests > 0;
    case "ordered":
      return row.ordered_requests > 0;
    case "delivered":
      return row.delivered_requests > 0;
    case "closed":
      // rejected + cancelled = everything the other counters don't cover.
      return (
        row.total_requests -
          (row.pending_requests + row.approved_requests + row.ordered_requests + row.delivered_requests) >
        0
      );
  }
}

const REQUIREMENT_PROJECT_COLUMNS = "id, name, project_code, client_name, status, archived_at, site_manager_name";

export async function listRequirements(params: SearchParamsRecord): Promise<RequirementsResult> {
  const filters = parseRequirementParams(params);
  const supabase = await createClient();
  const statuses = filters.status ? REQUIREMENT_STATUS_GROUPS[filters.status] : null;
  const failLoad = (error: unknown, context: string): never => {
    throw loadError(error, "We couldn't load material requirements.", context);
  };

  const projectBase = (columns: string, head = false) => {
    let query = supabase
      .from("project_directory")
      .select(columns, { count: "exact", head })
      .gt("total_material_requests", 0);
    if (filters.q) query = query.or(ilikeAnyFilter(["name", "project_code", "client_name"], filters.q));
    if (filters.project) query = query.eq("id", filters.project);
    return query.order("archived_at", { ascending: true, nullsFirst: true }).order("name").order("id");
  };

  let pageProjects: (ProjectOption & { site_manager_name: string | null })[];
  let total: number;
  let page = filters.page;

  if (!statuses || !filters.status) {
    const result = await fetchPage(
      filters.page,
      filters.pageSize,
      (from, to) => projectBase(REQUIREMENT_PROJECT_COLUMNS).range(from, to),
      () => projectBase("id", true),
    );
    if (result.error) failLoad(result.error, "materials.requirements.projects");
    pageProjects = result.rows as unknown as (ProjectOption & { site_manager_name: string | null })[];
    total = result.total;
    page = result.page;
  } else {
    // Status filter: match projects through the per-project counters of project_material_summary
    // (one row per project) instead of collecting request rows, so nothing is lost past
    // PostgREST's 1000-row cap and no long id list is put in a URL. Candidates (search / sort)
    // and matches are both read in full, intersected here, then paged.
    const status = filters.status;
    const [candidates, summaries] = await Promise.all([
      fetchAllRows<{ id: string }>((from, to) => projectBase("id").range(from, to) as unknown as PromiseLike<{ data: { id: string }[] | null; error: unknown }>),
      fetchAllRows<SummaryCounts>((from, to) =>
        supabase
          .from("project_material_summary")
          .select("project_id, total_requests, pending_requests, approved_requests, ordered_requests, delivered_requests")
          .gt("total_requests", 0)
          .order("project_id")
          .range(from, to),
      ),
    ]);
    if (candidates.error) failLoad(candidates.error, "materials.requirements.candidates");
    if (summaries.error) failLoad(summaries.error, "materials.requirements.summaryCounts");
    const matching = new Set(summaries.rows.filter((row) => matchesStatusGroup(row, status)).map((row) => row.project_id));
    const orderedIds = candidates.rows.map((row) => row.id).filter((id) => matching.has(id));
    total = orderedIds.length;
    page = Math.min(filters.page, lastPageFor(total, filters.pageSize));
    const { from, to } = rangeOf(page, filters.pageSize);
    const pageIds = orderedIds.slice(from, to + 1);
    if (pageIds.length === 0) {
      pageProjects = [];
    } else {
      const { data, error } = await supabase.from("project_directory").select(REQUIREMENT_PROJECT_COLUMNS).in("id", pageIds);
      if (error) failLoad(error, "materials.requirements.projects");
      const byId = new Map((data ?? []).map((row) => [row.id, row]));
      pageProjects = pageIds.flatMap((id) => {
        const row = byId.get(id);
        return row ? [row] : [];
      });
    }
  }

  const resolvedFilters = { ...filters, page };
  if (pageProjects.length === 0) return { filters: resolvedFilters, projects: [], total };
  const ids = pageProjects.map((p) => p.id);

  const [summaryRes, requestRes] = await Promise.all([
    supabase.from("project_material_summary").select("*").in("project_id", ids),
    fetchAllRows((from, to) => {
      let requestQuery = supabase
        .from("material_request_directory")
        .select("id, request_code, status, project_id, required_date")
        .in("project_id", ids)
        .is("archived_at", null);
      if (statuses) requestQuery = requestQuery.in("status", [...statuses]);
      return requestQuery.order("required_date").order("id").range(from, to);
    }),
  ]);
  if (summaryRes.error) throw loadError(summaryRes.error, "We couldn't load material totals.", "materials.requirements.summary");
  if (requestRes.error) throw loadError(requestRes.error, "We couldn't load material requests.", "materials.requirements.requests");

  const requests = requestRes.rows;
  const requestById = new Map(requests.map((r) => [r.id, r]));
  const lines: (RequirementLine & { projectId: string })[] = [];
  if (requests.length > 0) {
    // Request ids go into `.in()` in chunks of 100, each read in full.
    const { rows: items, error: itemsError } = await fetchAllByIds(
      requests.map((r) => r.id),
      (chunkIds, from, to) =>
        supabase
          .from("material_request_items")
          .select("id, request_id, material_name, category, quantity, delivered_quantity, unit, created_at")
          .in("request_id", chunkIds)
          .order("created_at")
          .order("id")
          .range(from, to),
    );
    if (itemsError) throw loadError(itemsError, "We couldn't load requested items.", "materials.requirements.items");
    for (const item of items) {
      const req = requestById.get(item.request_id);
      if (!req) continue;
      lines.push({
        id: item.id,
        projectId: req.project_id,
        materialName: item.material_name,
        category: item.category,
        quantity: Number(item.quantity),
        deliveredQuantity: Number(item.delivered_quantity),
        unit: item.unit,
        requestId: req.id,
        requestCode: req.request_code,
        status: req.status,
        requiredDate: req.required_date,
      });
    }
  }
  // Most urgent first: open lines by required date, closed lines last.
  const closed = new Set<string>(MATERIAL_CLOSED_STATUSES);
  lines.sort((a, b) => {
    const ca = closed.has(a.status) ? 1 : 0;
    const cb = closed.has(b.status) ? 1 : 0;
    if (ca !== cb) return ca - cb;
    return a.requiredDate.localeCompare(b.requiredDate);
  });

  const summaries = new Map((summaryRes.data ?? []).map((s) => [s.project_id, s]));
  return {
    filters: resolvedFilters,
    total,
    projects: pageProjects.map((project) => ({
      project,
      summary: summaries.get(project.id) ?? null,
      lines: lines.filter((line) => line.projectId === project.id),
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Catalog (/materials?tab=catalog)                                           */
/* -------------------------------------------------------------------------- */

export type CatalogFilters = {
  q: string;
  category: string | undefined;
  active: CatalogActiveFilter | undefined;
  page: number;
  pageSize: number;
  sort: "name" | "category" | "unit" | "updated_at";
  dir: "asc" | "desc";
};

export function parseCatalogParams(params: SearchParamsRecord): CatalogFilters {
  const list = parseListParams(params, {
    sortable: ["name", "category", "unit", "updated_at"] as const,
    defaultSort: "name",
  });
  const category = getParam(params, "category");
  return {
    q: list.q,
    category: category ? category.slice(0, 80) : undefined,
    active: parseEnumParam(params, "active", CATALOG_ACTIVE_FILTERS),
    page: list.page,
    pageSize: list.pageSize,
    sort: list.sort,
    dir: list.dir,
  };
}

export async function listCatalog(
  params: SearchParamsRecord,
): Promise<{ filters: CatalogFilters; rows: Material[]; total: number; outOfRange: boolean }> {
  const filters = parseCatalogParams(params);
  const supabase = await createClient();
  const { from, to } = pageRange(filters.page, filters.pageSize);
  let query = supabase.from("materials").select("*", { count: "exact" });
  if (filters.q) query = query.or(ilikeAnyFilter(["name", "category", "description"], filters.q));
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.active === "active") query = query.eq("is_active", true);
  if (filters.active === "inactive") query = query.eq("is_active", false);
  const { data, error, count } = await query
    .order(filters.sort, { ascending: filters.dir === "asc", nullsFirst: false })
    .order("name")
    .range(from, to);
  if (error && error.code === "PGRST103") return { filters: { ...filters, page: 1 }, rows: [], total: 0, outOfRange: true };
  if (error) throw loadError(error, "We couldn't load the materials catalog.", "materials.catalog");
  return { filters, rows: data ?? [], total: count ?? 0, outOfRange: false };
}
