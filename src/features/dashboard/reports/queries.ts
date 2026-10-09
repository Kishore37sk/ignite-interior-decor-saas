import "server-only";
import { toFriendlyError } from "@/lib/errors";
import { isOutOfRange, lastPageFor, rangeOf } from "@/lib/pagination";
import { ilikeAnyFilter, pageRange } from "@/lib/search-params";
import type { TypedSupabaseClient } from "@/types/supabase";
import type {
  AdminPerformanceRow,
  MaterialRequestDirectoryRow,
  ProjectDirectoryRow,
  SiteManagerPerformanceRow,
} from "@/types/database";
import {
  PROJECT_SORT_COLUMNS,
  REPORT_EXPORT_LIMIT,
  type AdminReportSort,
  type MaterialReportFilters,
  type PeopleReportFilters,
  type ProjectReportFilters,
  type ReportPaging,
  type SmReportSort,
} from "./config";

/** PostgREST caps a single response (Supabase default: 1000 rows), so large reads are chunked. */
const CHUNK_SIZE = 1000;

export type ReportResult<Row, Totals> =
  | {
      ok: true;
      rows: Row[];
      /** Rows matching the filters (may exceed what was returned). */
      total: number;
      totals: Totals;
      /** True when totals/exports only cover the first REPORT_EXPORT_LIMIT rows. */
      truncated: boolean;
      /** Page actually returned (a stale page past the end falls back to the last page). */
      page?: number;
    }
  | { ok: false; error: string };

/** Page = one page with totals over the filtered set; export = up to REPORT_EXPORT_LIMIT rows. */
export type ReportMode = { kind: "page"; paging: ReportPaging } | { kind: "export" };

type ChunkResult<T> = { data: T[] | null; error: unknown; count?: number | null };

async function fetchAllChunks<T>(
  fetchChunk: (from: number, to: number) => PromiseLike<ChunkResult<T>>,
  max = REPORT_EXPORT_LIMIT,
): Promise<{ rows: T[]; count: number | null; error: unknown }> {
  const rows: T[] = [];
  let count: number | null = null;
  for (let from = 0; from < max; from += CHUNK_SIZE) {
    const to = Math.min(from + CHUNK_SIZE, max) - 1;
    const { data, error, count: chunkCount } = await fetchChunk(from, to);
    if (error) return { rows, count, error };
    if (count === null && typeof chunkCount === "number") count = chunkCount;
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < to - from + 1) break;
  }
  return { rows, count, error: null };
}

function n(value: unknown): number {
  const v = typeof value === "number" ? value : Number(value);
  return Number.isFinite(v) ? v : 0;
}

function nOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const v = typeof value === "number" ? value : Number(value);
  return Number.isFinite(v) ? v : null;
}

/* -------------------------------------------------------------------------- */
/* Project report (owner only)                                                */
/* -------------------------------------------------------------------------- */

export type ProjectFinance = {
  project_cost: number;
  material_estimated_cost: number;
  material_actual_cost: number;
  material_variance: number;
};

export type ProjectReportRow = Pick<
  ProjectDirectoryRow,
  | "id"
  | "project_code"
  | "name"
  | "client_name"
  | "status"
  | "priority"
  | "progress_percentage"
  | "start_date"
  | "expected_completion_date"
  | "handover_date"
  | "actual_handover_date"
  | "site_manager_name"
  | "is_overdue"
> & { finance: ProjectFinance | null };

export type ProjectReportTotals = {
  count: number;
  overdue: number;
  avgProgress: number | null;
  projectCost: number;
  materialEstimated: number;
  materialActual: number;
  variance: number;
};

const PROJECT_REPORT_COLUMNS =
  "id, project_code, name, client_name, status, priority, progress_percentage, start_date, expected_completion_date, handover_date, actual_handover_date, site_manager_name, is_overdue";

function projectQuery<S extends string>(
  supabase: TypedSupabaseClient,
  columns: S,
  f: ProjectReportFilters,
  withCount: boolean,
) {
  let query = supabase
    .from("project_directory")
    .select(columns, withCount ? { count: "exact" } : undefined)
    .is("archived_at", null);
  if (f.q) query = query.or(ilikeAnyFilter(["name", "project_code", "client_name", "city"], f.q));
  if (f.status) query = query.eq("status", f.status);
  if (f.sm) query = query.contains("site_manager_ids", [f.sm]);
  if (f.range.from) query = query.gte("expected_completion_date", f.range.from);
  if (f.range.to) query = query.lte("expected_completion_date", f.range.to);
  return query
    .order(PROJECT_SORT_COLUMNS[f.sort], { ascending: f.dir === "asc", nullsFirst: false })
    .order("project_code", { ascending: true });
}

async function loadFinanceMap(supabase: TypedSupabaseClient): Promise<{ map: Map<string, ProjectFinance>; error: unknown }> {
  const { rows, error } = await fetchAllChunks((from, to) =>
    supabase
      .from("project_financial_summary")
      .select("project_id, project_cost, material_estimated_cost, material_actual_cost, material_variance")
      .order("project_id", { ascending: true })
      .range(from, to),
    // Every project, not just the filtered ones (ids can't be listed in a URL at this size).
    REPORT_EXPORT_LIMIT * 4,
  );
  const map = new Map<string, ProjectFinance>();
  for (const row of rows) {
    map.set(row.project_id, {
      project_cost: n(row.project_cost),
      material_estimated_cost: n(row.material_estimated_cost),
      material_actual_cost: n(row.material_actual_cost),
      material_variance: n(row.material_variance),
    });
  }
  return { map, error };
}

export async function fetchProjectReport(
  supabase: TypedSupabaseClient,
  filters: ProjectReportFilters,
  mode: ReportMode,
): Promise<ReportResult<ProjectReportRow, ProjectReportTotals>> {
  const fail = (err: unknown) => ({
    ok: false as const,
    error: toFriendlyError(err, "We couldn't load the project report.", "reports.projects"),
  });

  const finance = await loadFinanceMap(supabase);
  if (finance.error) return fail(finance.error);
  const withFinance = <T extends { id: string }>(row: T) => ({ ...row, finance: finance.map.get(row.id) ?? null });

  if (mode.kind === "export") {
    const all = await fetchAllChunks((from, to) =>
      projectQuery(supabase, PROJECT_REPORT_COLUMNS, filters, from === 0).range(from, to),
    );
    if (all.error) return fail(all.error);
    const total = all.count ?? all.rows.length;
    return {
      ok: true,
      rows: all.rows.map(withFinance),
      total,
      totals: emptyProjectTotals(),
      truncated: total > all.rows.length,
    };
  }

  const { from, to } = pageRange(mode.paging.page, mode.paging.pageSize);
  const [firstPage, totalsRows] = await Promise.all([
    projectQuery(supabase, PROJECT_REPORT_COLUMNS, filters, true).range(from, to),
    fetchAllChunks((start, end) =>
      projectQuery(supabase, "id, progress_percentage, is_overdue, status", filters, false).range(start, end),
    ),
  ]);
  if (totalsRows.error) return fail(totalsRows.error);
  let page = firstPage;
  let shownPage = mode.paging.page;
  if (isOutOfRange(page.error)) {
    shownPage = lastPageFor(totalsRows.rows.length, mode.paging.pageSize);
    const last = rangeOf(shownPage, mode.paging.pageSize);
    page = await projectQuery(supabase, PROJECT_REPORT_COLUMNS, filters, true).range(last.from, last.to);
  }
  if (page.error) return fail(page.error);

  const totals = emptyProjectTotals();
  let progressSum = 0;
  let progressCount = 0;
  for (const row of totalsRows.rows) {
    totals.count += 1;
    if (row.is_overdue) totals.overdue += 1;
    if (row.status !== "cancelled") {
      progressSum += n(row.progress_percentage);
      progressCount += 1;
    }
    const f = finance.map.get(row.id);
    if (f) {
      totals.projectCost += f.project_cost;
      totals.materialEstimated += f.material_estimated_cost;
      totals.materialActual += f.material_actual_cost;
      totals.variance += f.material_variance;
    }
  }
  totals.avgProgress = progressCount > 0 ? progressSum / progressCount : null;
  const total = page.count ?? totalsRows.rows.length;

  return {
    ok: true,
    rows: (page.data ?? []).map(withFinance),
    total,
    totals,
    truncated: total > totalsRows.rows.length,
    page: shownPage,
  };
}

function emptyProjectTotals(): ProjectReportTotals {
  return {
    count: 0,
    overdue: 0,
    avgProgress: null,
    projectCost: 0,
    materialEstimated: 0,
    materialActual: 0,
    variance: 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Material report (owner full; admin / site manager RLS-scoped)              */
/* -------------------------------------------------------------------------- */

export type MaterialReportRow = Pick<
  MaterialRequestDirectoryRow,
  | "id"
  | "request_code"
  | "title"
  | "project_id"
  | "project_code"
  | "project_name"
  | "items_summary"
  | "item_count"
  | "required_date"
  | "priority"
  | "status"
  | "requested_by_name"
  | "assigned_admin_name"
  | "estimated_cost"
  | "approved_cost"
  | "actual_cost"
  | "cost_variance"
  | "delivery_date"
  | "created_at"
>;

export type MaterialReportTotals = {
  count: number;
  overdue: number;
  estimated: number;
  approved: number;
  actual: number;
  /** Actual − estimated over requests that have an actual cost. */
  variance: number;
};

const MATERIAL_REPORT_COLUMNS =
  "id, request_code, title, project_id, project_code, project_name, items_summary, item_count, required_date, priority, status, requested_by_name, assigned_admin_name, estimated_cost, approved_cost, actual_cost, cost_variance, delivery_date, created_at";

function materialQuery<S extends string>(
  supabase: TypedSupabaseClient,
  columns: S,
  f: MaterialReportFilters,
  withCount: boolean,
) {
  let query = supabase
    .from("material_request_directory")
    .select(columns, withCount ? { count: "exact" } : undefined)
    .is("archived_at", null);
  if (f.q) {
    query = query.or(ilikeAnyFilter(["request_code", "title", "project_name", "project_code", "items_summary"], f.q));
  }
  if (f.status) query = query.eq("status", f.status);
  if (f.sm) query = query.eq("requested_by", f.sm);
  if (f.range.from) query = query.gte("required_date", f.range.from);
  if (f.range.to) query = query.lte("required_date", f.range.to);
  return query
    .order(f.sort, { ascending: f.dir === "asc", nullsFirst: false })
    .order("request_code", { ascending: true });
}

export async function fetchMaterialReport(
  supabase: TypedSupabaseClient,
  filters: MaterialReportFilters,
  mode: ReportMode,
): Promise<ReportResult<MaterialReportRow, MaterialReportTotals>> {
  const fail = (err: unknown) => ({
    ok: false as const,
    error: toFriendlyError(err, "We couldn't load the material report.", "reports.materials"),
  });

  if (mode.kind === "export") {
    const all = await fetchAllChunks((from, to) =>
      materialQuery(supabase, MATERIAL_REPORT_COLUMNS, filters, from === 0).range(from, to),
    );
    if (all.error) return fail(all.error);
    const total = all.count ?? all.rows.length;
    return { ok: true, rows: all.rows, total, totals: emptyMaterialTotals(), truncated: total > all.rows.length };
  }

  const { from, to } = pageRange(mode.paging.page, mode.paging.pageSize);
  const [firstPage, totalsRows] = await Promise.all([
    materialQuery(supabase, MATERIAL_REPORT_COLUMNS, filters, true).range(from, to),
    fetchAllChunks((start, end) =>
      materialQuery(supabase, "id, status, required_state, estimated_cost, approved_cost, actual_cost, cost_variance", filters, false).range(
        start,
        end,
      ),
    ),
  ]);
  if (totalsRows.error) return fail(totalsRows.error);
  let page = firstPage;
  let shownPage = mode.paging.page;
  if (isOutOfRange(page.error)) {
    shownPage = lastPageFor(totalsRows.rows.length, mode.paging.pageSize);
    const last = rangeOf(shownPage, mode.paging.pageSize);
    page = await materialQuery(supabase, MATERIAL_REPORT_COLUMNS, filters, true).range(last.from, last.to);
  }
  if (page.error) return fail(page.error);

  const totals = emptyMaterialTotals();
  for (const row of totalsRows.rows) {
    totals.count += 1;
    if (row.required_state === "overdue") totals.overdue += 1;
    // Rejected/cancelled requests never cost anything (matches the owner dashboard).
    if (row.status === "rejected" || row.status === "cancelled") continue;
    const estimated = nOrNull(row.estimated_cost);
    const actual = nOrNull(row.actual_cost);
    totals.estimated += estimated ?? 0;
    totals.approved += n(row.approved_cost);
    totals.actual += actual ?? 0;
    // Like-for-like (same rule as the dashboard and project financials).
    if (actual !== null) totals.variance += n(row.cost_variance);
  }
  const total = page.count ?? totalsRows.rows.length;

  return { ok: true, rows: page.data ?? [], total, totals, truncated: total > totalsRows.rows.length, page: shownPage };
}

function emptyMaterialTotals(): MaterialReportTotals {
  return { count: 0, overdue: 0, estimated: 0, approved: 0, actual: 0, variance: 0 };
}

/* -------------------------------------------------------------------------- */
/* Site manager & admin reports (owner only; RPC aggregates)                  */
/* -------------------------------------------------------------------------- */

function matchesPerson(row: { full_name: string; employee_id: string | null }, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return row.full_name.toLowerCase().includes(needle) || (row.employee_id ?? "").toLowerCase().includes(needle);
}

function compareValues(a: number | string | null, b: number | string | null, ascending: boolean): number {
  // Nulls always last, whatever the direction.
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const result = typeof a === "string" && typeof b === "string" ? a.localeCompare(b) : Number(a) - Number(b);
  return ascending ? result : -result;
}

function pageSlice<T>(rows: T[], mode: ReportMode): T[] {
  if (mode.kind === "export") return rows.slice(0, REPORT_EXPORT_LIMIT);
  const { from, to } = pageRange(mode.paging.page, mode.paging.pageSize);
  return rows.slice(from, to + 1);
}

export type SmReportTotals = {
  count: number;
  assigned: number;
  ongoing: number;
  completed: number;
  delayed: number;
  onTime: number;
  onTimeRate: number | null;
  requests: number;
};

const SM_SORT_VALUE: Record<SmReportSort, (row: SiteManagerPerformanceRow) => number | string | null> = {
  name: (row) => row.full_name,
  assigned: (row) => row.assigned_projects,
  completed: (row) => row.completed_projects,
  delayed: (row) => row.delayed_projects,
  on_time_rate: (row) => row.on_time_rate,
  avg_progress: (row) => row.avg_progress,
  requests: (row) => row.material_requests_created,
  updates: (row) => row.project_updates_count,
};

export async function fetchSiteManagerReport(
  supabase: TypedSupabaseClient,
  filters: PeopleReportFilters<SmReportSort>,
  mode: ReportMode,
): Promise<ReportResult<SiteManagerPerformanceRow, SmReportTotals>> {
  const { data, error } = await supabase.rpc("get_site_manager_performance");
  if (error) {
    return { ok: false, error: toFriendlyError(error, "We couldn't load the site manager report.", "reports.siteManagers") };
  }
  const all = (data ?? [])
    .map((row) => ({
      ...row,
      assigned_projects: n(row.assigned_projects),
      ongoing_projects: n(row.ongoing_projects),
      completed_projects: n(row.completed_projects),
      delayed_projects: n(row.delayed_projects),
      on_time_completed: n(row.on_time_completed),
      on_time_rate: nOrNull(row.on_time_rate),
      avg_progress: nOrNull(row.avg_progress),
      material_requests_created: n(row.material_requests_created),
      avg_request_completion_days: nOrNull(row.avg_request_completion_days),
      project_updates_count: n(row.project_updates_count),
    }))
    .filter((row) => matchesPerson(row, filters.q) && (!filters.status || row.status === filters.status));

  const value = SM_SORT_VALUE[filters.sort];
  all.sort(
    (a, b) => compareValues(value(a), value(b), filters.dir === "asc") || a.full_name.localeCompare(b.full_name),
  );

  const totals: SmReportTotals = {
    count: all.length,
    assigned: 0,
    ongoing: 0,
    completed: 0,
    delayed: 0,
    onTime: 0,
    onTimeRate: null,
    requests: 0,
  };
  for (const row of all) {
    totals.assigned += row.assigned_projects;
    totals.ongoing += row.ongoing_projects;
    totals.completed += row.completed_projects;
    totals.delayed += row.delayed_projects;
    totals.onTime += row.on_time_completed;
    totals.requests += row.material_requests_created;
  }
  totals.onTimeRate = totals.completed > 0 ? (totals.onTime / totals.completed) * 100 : null;

  return {
    ok: true,
    rows: pageSlice(all, mode),
    total: all.length,
    totals,
    truncated: mode.kind === "export" && all.length > REPORT_EXPORT_LIMIT,
  };
}

export type AdminReportTotals = {
  count: number;
  assigned: number;
  pending: number;
  processing: number;
  completed: number;
  rejected: number;
  overdue: number;
  completionRate: number | null;
  value: number;
};

const ADMIN_SORT_VALUE: Record<AdminReportSort, (row: AdminPerformanceRow) => number | string | null> = {
  name: (row) => row.full_name,
  assigned: (row) => row.requests_assigned,
  pending: (row) => row.pending,
  completed: (row) => row.completed,
  overdue: (row) => row.overdue,
  completion_rate: (row) => row.completion_rate,
  avg_response: (row) => row.avg_response_hours,
  avg_completion: (row) => row.avg_completion_days,
  value: (row) => row.total_value_managed,
};

export async function fetchAdminReport(
  supabase: TypedSupabaseClient,
  filters: PeopleReportFilters<AdminReportSort>,
  mode: ReportMode,
): Promise<ReportResult<AdminPerformanceRow, AdminReportTotals>> {
  const { data, error } = await supabase.rpc("get_admin_performance");
  if (error) {
    return { ok: false, error: toFriendlyError(error, "We couldn't load the admin report.", "reports.admins") };
  }
  const all = (data ?? [])
    .map((row) => ({
      ...row,
      requests_assigned: n(row.requests_assigned),
      pending: n(row.pending),
      processing: n(row.processing),
      completed: n(row.completed),
      rejected: n(row.rejected),
      overdue: n(row.overdue),
      completion_rate: nOrNull(row.completion_rate),
      avg_response_hours: nOrNull(row.avg_response_hours),
      avg_completion_days: nOrNull(row.avg_completion_days),
      total_value_managed: nOrNull(row.total_value_managed),
    }))
    .filter((row) => matchesPerson(row, filters.q) && (!filters.status || row.status === filters.status));

  const value = ADMIN_SORT_VALUE[filters.sort];
  all.sort(
    (a, b) => compareValues(value(a), value(b), filters.dir === "asc") || a.full_name.localeCompare(b.full_name),
  );

  const totals: AdminReportTotals = {
    count: all.length,
    assigned: 0,
    pending: 0,
    processing: 0,
    completed: 0,
    rejected: 0,
    overdue: 0,
    completionRate: null,
    value: 0,
  };
  for (const row of all) {
    totals.assigned += row.requests_assigned;
    totals.pending += row.pending;
    totals.processing += row.processing;
    totals.completed += row.completed;
    totals.rejected += row.rejected;
    totals.overdue += row.overdue;
    totals.value += row.total_value_managed ?? 0;
  }
  totals.completionRate = totals.assigned > 0 ? (totals.completed / totals.assigned) * 100 : null;

  return {
    ok: true,
    rows: pageSlice(all, mode),
    total: all.length,
    totals,
    truncated: mode.kind === "export" && all.length > REPORT_EXPORT_LIMIT,
  };
}

/* -------------------------------------------------------------------------- */
/* Filter options                                                             */
/* -------------------------------------------------------------------------- */

/** Active site managers for the "Site manager" filter (team_directory has no contact data). */
export async function fetchSiteManagerOptions(
  supabase: TypedSupabaseClient,
): Promise<{ value: string; label: string }[]> {
  const { data, error } = await supabase
    .from("team_directory")
    .select("id, full_name, employee_id")
    .eq("role", "site_manager")
    .order("full_name", { ascending: true })
    .limit(500);
  if (error) {
    toFriendlyError(error, "", "reports.siteManagerOptions");
    return [];
  }
  return (data ?? []).map((row) => ({
    value: row.id,
    label: row.employee_id ? `${row.full_name} (${row.employee_id})` : row.full_name,
  }));
}
