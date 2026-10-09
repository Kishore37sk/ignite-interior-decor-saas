import "server-only";
import type { CurrentUser } from "@/lib/auth";
import { PROJECT_STATUSES } from "@/lib/constants";
import { logServerError, toFriendlyError } from "@/lib/errors";
import { fetchAllRows, fetchPage } from "@/lib/pagination";
import {
  ilikeAnyFilter,
  parseEnumParam,
  parseListParams,
  parseUuidParam,
  type SearchParamsRecord,
} from "@/lib/search-params";
import { createClient } from "@/lib/supabase/server";
import type { ClientDirectoryRow, ProjectStatus } from "@/types/database";
import {
  CLIENT_SORT_COLUMNS,
  CLIENT_SORT_KEYS,
  CLIENT_STATUS_FILTERS,
  type ClientSortKey,
  type ClientStatusFilter,
} from "./schemas";

export type ClientListFilters = {
  q: string;
  status: ClientStatusFilter;
  projectStatus: ProjectStatus | undefined;
  sm: string | undefined;
  page: number;
  pageSize: number;
  sort: ClientSortKey;
  dir: "asc" | "desc";
};

export type ClientCostSummary = { latestProjectCost: number | null; totalCost: number; projectCount: number };

export type ClientListResult = {
  filters: ClientListFilters;
  rows: ClientDirectoryRow[];
  total: number;
  /** Owner only: client id → cost summary (from project_financial_summary). */
  costs: Map<string, ClientCostSummary> | null;
};

export function parseClientListParams(params: SearchParamsRecord): ClientListFilters {
  const list = parseListParams(params, {
    sortable: CLIENT_SORT_KEYS,
    defaultSort: "created_at",
    defaultDir: "desc",
  });
  return {
    q: list.q,
    status: parseEnumParam(params, "status", CLIENT_STATUS_FILTERS) ?? "active",
    projectStatus: parseEnumParam(params, "project_status", PROJECT_STATUSES),
    sm: parseUuidParam(params, "sm"),
    page: list.page,
    pageSize: list.pageSize,
    sort: list.sort,
    dir: list.dir,
  };
}

/** Clients list (client_directory, RLS-scoped) with filters, sort and pagination. */
export async function listClients(params: SearchParamsRecord, user: CurrentUser): Promise<ClientListResult> {
  const filters = parseClientListParams(params);
  const supabase = await createClient();

  // `sm` filter: clients that have a project where this site manager is assigned.
  let smClientIds: string[] | null = null;
  if (filters.sm) {
    const { rows, error } = await fetchAllRows((from, to) =>
      supabase
        .from("project_directory")
        .select("id, client_id")
        .contains("site_manager_ids", `{${filters.sm}}`)
        .order("id")
        .range(from, to),
    );
    if (error) throw new Error(toFriendlyError(error, "We couldn't load clients.", "clients.list.sm"));
    smClientIds = Array.from(new Set(rows.map((row) => row.client_id)));
    if (smClientIds.length === 0) return { filters, rows: [], total: 0, costs: null };
  }

  const build = (head = false) => {
    let query = supabase.from("client_directory").select("*", { count: "exact", head });
    if (filters.q) {
      query = query.or(ilikeAnyFilter(["name", "client_code", "phone", "email", "city", "latest_project_name"], filters.q));
    }
    if (filters.status === "active") query = query.is("archived_at", null);
    if (filters.status === "archived") query = query.not("archived_at", "is", null);
    if (filters.projectStatus) query = query.eq("latest_project_status", filters.projectStatus);
    if (smClientIds) query = query.in("id", smClientIds);
    return query;
  };

  const { rows: data, total, page, error } = await fetchPage(
    filters.page,
    filters.pageSize,
    (from, to) =>
      build()
        .order(CLIENT_SORT_COLUMNS[filters.sort], { ascending: filters.dir === "asc", nullsFirst: false })
        .order("id", { ascending: true })
        .range(from, to),
    () => build(true),
  );
  if (error) throw new Error(toFriendlyError(error, "We couldn't load clients.", "clients.list"));

  const rows = data;
  let costs: Map<string, ClientCostSummary> | null = null;
  if (user.role === "owner" && rows.length > 0) {
    costs = new Map();
    const { data: fin, error: finError } = await supabase
      .from("project_financial_summary")
      .select("project_id, client_id, project_cost")
      .in(
        "client_id",
        rows.map((row) => row.id),
      );
    if (finError) {
      logServerError("clients.list.costs", finError);
    } else {
      const latestByClient = new Map(rows.map((row) => [row.id, row.latest_project_id]));
      for (const item of fin ?? []) {
        const entry = costs.get(item.client_id) ?? { latestProjectCost: null, totalCost: 0, projectCount: 0 };
        const cost = Number(item.project_cost ?? 0);
        entry.totalCost += cost;
        entry.projectCount += 1;
        if (latestByClient.get(item.client_id) === item.project_id) entry.latestProjectCost = cost;
        costs.set(item.client_id, entry);
      }
    }
  }

  return { filters: { ...filters, page }, rows, total, costs };
}

/** Active clients for the project form's client picker (owner). */
export async function listActiveClientOptions(): Promise<{ id: string; name: string; client_code: string; city: string | null }[]> {
  const supabase = await createClient();
  // Read in full (PostgREST returns at most 1000 rows per request).
  const { rows, error } = await fetchAllRows((from, to) =>
    supabase
      .from("clients")
      .select("id, name, client_code, city")
      .is("archived_at", null)
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (error) throw new Error(toFriendlyError(error, "We couldn't load clients.", "clients.options"));
  return rows;
}
