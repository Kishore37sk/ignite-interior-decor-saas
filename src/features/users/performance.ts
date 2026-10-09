import "server-only";
import { parseEnumParam, parseListParams, type SearchParamsRecord } from "@/lib/search-params";
import type { AdminPerformanceRow, SiteManagerPerformanceRow, UserStatus } from "@/types/database";
import {
  getAdminPerformance,
  getProfilesByIds,
  getSiteManagerPerformance,
  type StaffProfile,
} from "./queries";
import { ADMIN_SORT_KEYS, SM_SORT_KEYS, USER_STATUS_FILTERS, type AdminSortKey, type SiteManagerSortKey } from "./schemas";

export type PerformanceFilters<K extends string> = {
  q: string;
  status: UserStatus | undefined;
  page: number;
  pageSize: number;
  sort: K;
  dir: "asc" | "desc";
};

export type WithProfile<T> = T & { profile: StaffProfile | null };

type Summary = { total: number; active: number };

function matches(q: string, values: (string | null | undefined)[]): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return values.some((v) => (v ?? "").toLowerCase().includes(needle));
}

/** Compare with nulls always last regardless of direction. */
function compare(a: number | string | null, b: number | string | null, dir: "asc" | "desc"): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const result = typeof a === "string" && typeof b === "string" ? a.localeCompare(b) : Number(a) - Number(b);
  return dir === "asc" ? result : -result;
}

function paginate<T>(rows: T[], page: number, pageSize: number): T[] {
  const from = (page - 1) * pageSize;
  return rows.slice(from, from + pageSize);
}

const SM_SORT_VALUE: Record<SiteManagerSortKey, (r: SiteManagerPerformanceRow) => number | string | null> = {
  name: (r) => r.full_name,
  assigned: (r) => r.assigned_projects,
  ongoing: (r) => r.ongoing_projects,
  delayed: (r) => r.delayed_projects,
  on_time: (r) => r.on_time_rate,
  progress: (r) => r.avg_progress,
  requests: (r) => r.material_requests_created,
  last_update: (r) => r.last_update_at,
};

export async function listSiteManagerPerformance(params: SearchParamsRecord): Promise<{
  filters: PerformanceFilters<SiteManagerSortKey>;
  rows: WithProfile<SiteManagerPerformanceRow>[];
  total: number;
  all: SiteManagerPerformanceRow[];
  summary: Summary;
}> {
  const list = parseListParams(params, { sortable: SM_SORT_KEYS, defaultSort: "name", defaultDir: "asc" });
  const status = parseEnumParam(params, "status", USER_STATUS_FILTERS);
  const all = await getSiteManagerPerformance();
  const profiles = await getProfilesByIds(all.map((r) => r.user_id));

  const filtered = all
    .filter((r) => !status || r.status === status)
    .filter((r) => {
      const p = profiles.get(r.user_id);
      return matches(list.q, [r.full_name, r.employee_id, p?.email, p?.phone]);
    })
    .sort(
      (a, b) =>
        compare(SM_SORT_VALUE[list.sort](a), SM_SORT_VALUE[list.sort](b), list.dir) ||
        a.full_name.localeCompare(b.full_name),
    );

  return {
    filters: { q: list.q, status, page: list.page, pageSize: list.pageSize, sort: list.sort, dir: list.dir },
    rows: paginate(filtered, list.page, list.pageSize).map((r) => ({ ...r, profile: profiles.get(r.user_id) ?? null })),
    total: filtered.length,
    all,
    summary: { total: all.length, active: all.filter((r) => r.status === "active").length },
  };
}

const ADMIN_SORT_VALUE: Record<AdminSortKey, (r: AdminPerformanceRow) => number | string | null> = {
  name: (r) => r.full_name,
  assigned: (r) => r.requests_assigned,
  pending: (r) => r.pending,
  overdue: (r) => r.overdue,
  completion: (r) => r.completion_rate,
  response: (r) => r.avg_response_hours,
  value: (r) => r.total_value_managed,
};

export async function listAdminPerformance(params: SearchParamsRecord): Promise<{
  filters: PerformanceFilters<AdminSortKey>;
  rows: WithProfile<AdminPerformanceRow>[];
  total: number;
  all: AdminPerformanceRow[];
  summary: Summary;
}> {
  const list = parseListParams(params, { sortable: ADMIN_SORT_KEYS, defaultSort: "name", defaultDir: "asc" });
  const status = parseEnumParam(params, "status", USER_STATUS_FILTERS);
  const all = await getAdminPerformance();
  const profiles = await getProfilesByIds(all.map((r) => r.user_id));

  const filtered = all
    .filter((r) => !status || r.status === status)
    .filter((r) => {
      const p = profiles.get(r.user_id);
      return matches(list.q, [r.full_name, r.employee_id, p?.email, p?.phone]);
    })
    .sort(
      (a, b) =>
        compare(ADMIN_SORT_VALUE[list.sort](a), ADMIN_SORT_VALUE[list.sort](b), list.dir) ||
        a.full_name.localeCompare(b.full_name),
    );

  return {
    filters: { q: list.q, status, page: list.page, pageSize: list.pageSize, sort: list.sort, dir: list.dir },
    rows: paginate(filtered, list.page, list.pageSize).map((r) => ({ ...r, profile: profiles.get(r.user_id) ?? null })),
    total: filtered.length,
    all,
    summary: { total: all.length, active: all.filter((r) => r.status === "active").length },
  };
}

/** Sum helper that ignores nulls. */
export function sumOf<T>(rows: readonly T[], pick: (row: T) => number | null | undefined): number {
  return rows.reduce((acc, row) => acc + (Number(pick(row)) || 0), 0);
}
