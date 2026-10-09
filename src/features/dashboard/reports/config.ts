/**
 * Report definitions shared by the /reports page and the CSV route
 * (`/api/reports/[type]`), so both always apply exactly the same filters.
 */
import {
  MATERIAL_REQUEST_STATUSES,
  PROJECT_STATUSES,
  USER_STATUSES,
} from "@/lib/constants";
import {
  buildSearchParams,
  parseDateRange,
  parseEnumParam,
  parsePage,
  parsePageSize,
  parseSearchQuery,
  parseSort,
  parseUuidParam,
  type DateRangeFilter,
  type SearchParamsInput,
  type SortDirection,
} from "@/lib/search-params";
import type { AppRole, MaterialRequestStatus, ProjectStatus, UserStatus } from "@/types/database";

export const REPORT_TYPES = ["projects", "materials", "site-managers", "admins"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_LABELS: Record<ReportType, string> = {
  projects: "Project Report",
  materials: "Material Report",
  "site-managers": "Site Manager Report",
  admins: "Admin Report",
};

export const REPORT_DESCRIPTIONS: Record<ReportType, string> = {
  projects: "Every project with client, status, progress, dates, site manager and costs.",
  materials: "Material requests with items, required dates, status and costs.",
  "site-managers": "Delivery record per site manager: projects, completion, delays, updates and requests.",
  admins: "Material request handling per admin: workload, processing time and completion.",
};

/** Maximum rows in one CSV export (and in report totals). */
export const REPORT_EXPORT_LIMIT = 5000;
export const REPORT_DEFAULT_PAGE_SIZE = 20;

export function isReportType(value: string | null | undefined): value is ReportType {
  return value !== null && value !== undefined && (REPORT_TYPES as readonly string[]).includes(value);
}

/** Owner gets every report; admins and site managers only the RLS-scoped material report. */
export function allowedReportTypes(role: AppRole): readonly ReportType[] {
  return role === "owner" ? REPORT_TYPES : ["materials"];
}

/** Whether a role may see a given material cost column in the material report. */
export function materialCostVisibility(role: AppRole): { estimated: boolean; approvedActual: boolean } {
  // app.md §85: material cost — owner/admin yes, site manager limited (the estimate they enter).
  return { estimated: true, approvedActual: role !== "site_manager" };
}

/* -------------------------------------------------------------------------- */
/* Filters                                                                    */
/* -------------------------------------------------------------------------- */

export const PROJECT_REPORT_SORTS = [
  "name",
  "client",
  "status",
  "progress",
  "start_date",
  "expected_completion_date",
  "handover_date",
] as const;
export type ProjectReportSort = (typeof PROJECT_REPORT_SORTS)[number];

export const PROJECT_SORT_COLUMNS: Record<ProjectReportSort, string> = {
  name: "name",
  client: "client_name",
  status: "status",
  progress: "progress_percentage",
  start_date: "start_date",
  expected_completion_date: "expected_completion_date",
  handover_date: "handover_date",
};

export type ProjectReportFilters = {
  q: string;
  status: ProjectStatus | undefined;
  sm: string | undefined;
  range: DateRangeFilter;
  sort: ProjectReportSort;
  dir: SortDirection;
};

export function parseProjectReportFilters(params: SearchParamsInput): ProjectReportFilters {
  const sort = parseSort(params, PROJECT_REPORT_SORTS, { sort: "expected_completion_date", dir: "asc" });
  return {
    q: parseSearchQuery(params),
    status: parseEnumParam(params, "status", PROJECT_STATUSES),
    sm: parseUuidParam(params, "sm"),
    range: parseDateRange(params),
    sort: sort.sort,
    dir: sort.dir,
  };
}

export const MATERIAL_REPORT_SORTS = ["required_date", "priority", "created_at", "status", "estimated_cost"] as const;
export type MaterialReportSort = (typeof MATERIAL_REPORT_SORTS)[number];

export type MaterialReportFilters = {
  q: string;
  status: MaterialRequestStatus | undefined;
  sm: string | undefined;
  range: DateRangeFilter;
  sort: MaterialReportSort;
  dir: SortDirection;
};

export function parseMaterialReportFilters(params: SearchParamsInput, role: AppRole): MaterialReportFilters {
  const sort = parseSort(params, MATERIAL_REPORT_SORTS, { sort: "required_date", dir: "asc" });
  return {
    q: parseSearchQuery(params),
    status: parseEnumParam(params, "status", MATERIAL_REQUEST_STATUSES),
    sm: role === "site_manager" ? undefined : parseUuidParam(params, "sm"),
    range: parseDateRange(params),
    sort: sort.sort,
    dir: sort.dir,
  };
}

export const SM_REPORT_SORTS = [
  "name",
  "assigned",
  "completed",
  "delayed",
  "on_time_rate",
  "avg_progress",
  "requests",
  "updates",
] as const;
export type SmReportSort = (typeof SM_REPORT_SORTS)[number];

export const ADMIN_REPORT_SORTS = [
  "name",
  "assigned",
  "pending",
  "completed",
  "overdue",
  "completion_rate",
  "avg_response",
  "avg_completion",
  "value",
] as const;
export type AdminReportSort = (typeof ADMIN_REPORT_SORTS)[number];

export type PeopleReportFilters<S extends string> = {
  q: string;
  status: UserStatus | undefined;
  sort: S;
  dir: SortDirection;
};

export function parseSmReportFilters(params: SearchParamsInput): PeopleReportFilters<SmReportSort> {
  const sort = parseSort(params, SM_REPORT_SORTS, { sort: "name", dir: "asc" });
  return {
    q: parseSearchQuery(params),
    status: parseEnumParam(params, "status", USER_STATUSES),
    sort: sort.sort,
    dir: sort.dir,
  };
}

export function parseAdminReportFilters(params: SearchParamsInput): PeopleReportFilters<AdminReportSort> {
  const sort = parseSort(params, ADMIN_REPORT_SORTS, { sort: "name", dir: "asc" });
  return {
    q: parseSearchQuery(params),
    status: parseEnumParam(params, "status", USER_STATUSES),
    sort: sort.sort,
    dir: sort.dir,
  };
}

export type ReportPaging = { page: number; pageSize: number };

export function parseReportPaging(params: SearchParamsInput): ReportPaging {
  return { page: parsePage(params), pageSize: parsePageSize(params, REPORT_DEFAULT_PAGE_SIZE) };
}

/** Same filters as the page, minus UI-only params, for the CSV export link. */
export function exportHref(type: ReportType, params: SearchParamsInput): string {
  const query = buildSearchParams(params, { tab: null, page: null, pageSize: null }).toString();
  return query ? `/api/reports/${type}?${query}` : `/api/reports/${type}`;
}
