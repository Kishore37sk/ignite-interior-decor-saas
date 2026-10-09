import "server-only";
import type { CurrentUser } from "@/lib/auth";
import { type DateRangePreset } from "@/lib/constants";
import { addDays } from "@/lib/dates";
import { toFriendlyError } from "@/lib/errors";
import { fetchPage } from "@/lib/pagination";
import {
  getParam,
  ilikeAnyFilter,
  parseDateRange,
  parsePage,
  parsePageSize,
  parseSearchQuery,
  parseUuidParam,
  type SearchParamsRecord,
} from "@/lib/search-params";
import { createClient } from "@/lib/supabase/server";
import { diffChanges, type ActivityChange } from "./diff";
import { entityTypesForRole, type ActivityFeedEntry } from "./entities";

export type { ActivityChange } from "./diff";

export const ACTIVITY_RANGE_PRESETS = ["today", "this_week", "this_month", "custom"] as const satisfies readonly DateRangePreset[];

export type ActivityFilters = {
  q: string;
  entity: string | undefined;
  user: string | undefined;
  project: string | undefined;
  rangePreset: DateRangePreset | undefined;
  from: string | null;
  to: string | null;
  page: number;
  pageSize: number;
};


export type ActivityRow = ActivityFeedEntry & {
  /** Owner only: changed fields (updates). */
  changes: ActivityChange[] | null;
};

const IST_OFFSET = "+05:30";

export function parseActivityParams(params: SearchParamsRecord, user: CurrentUser): ActivityFilters {
  const entityParam = getParam(params, "entity");
  const allowed = entityTypesForRole(user.role);
  const range = parseDateRange(params);
  return {
    q: parseSearchQuery(params),
    entity: entityParam && allowed.includes(entityParam) ? entityParam : undefined,
    user: user.role === "owner" ? parseUuidParam(params, "user") : undefined,
    project: parseUuidParam(params, "project"),
    rangePreset: range.preset,
    from: range.from,
    to: range.to,
    page: parsePage(params),
    pageSize: parsePageSize(params, 25),
  };
}

export async function listActivity(
  params: SearchParamsRecord,
  user: CurrentUser,
): Promise<{ filters: ActivityFilters; rows: ActivityRow[]; total: number }> {
  const filters = parseActivityParams(params, user);
  const supabase = await createClient();
  // RLS on audit_logs (security_invoker view) scopes rows per role.
  const build = (head = false) => {
    let query = supabase.from("activity_feed").select("*", { count: "exact", head });
    if (filters.q) query = query.or(ilikeAnyFilter(["summary", "actor_name"], filters.q));
    if (filters.entity) query = query.eq("entity_type", filters.entity);
    if (filters.user) query = query.eq("user_id", filters.user);
    if (filters.project) query = query.eq("project_id", filters.project);
    if (filters.from) query = query.gte("created_at", `${filters.from}T00:00:00${IST_OFFSET}`);
    if (filters.to) query = query.lt("created_at", `${addDays(filters.to, 1)}T00:00:00${IST_OFFSET}`);
    return query;
  };

  const { rows: data, total, page, error } = await fetchPage(
    filters.page,
    filters.pageSize,
    (from, to) =>
      build()
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    () => build(true),
  );
  if (error) throw new Error(toFriendlyError(error, "We couldn't load the activity log.", "activity.list"));
  const entries = data as unknown as ActivityFeedEntry[];

  let changes = new Map<string, ActivityChange[] | null>();
  if (user.role === "owner" && entries.length > 0) {
    changes = await loadChanges(entries.map((e) => e.id));
  }

  return {
    filters: { ...filters, page },
    rows: entries.map((entry) => ({ ...entry, changes: changes.get(entry.id) ?? null })),
    total,
  };
}

/** Owner only: old/new snapshots from audit_logs (owner RLS reads every row). */
async function loadChanges(ids: string[]): Promise<Map<string, ActivityChange[] | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("audit_logs").select("id, old_data, new_data").in("id", ids);
  const map = new Map<string, ActivityChange[] | null>();
  if (error) {
    // The feed is still useful without diffs; log and continue.
    toFriendlyError(error, "", "activity.changes");
    return map;
  }
  for (const row of data ?? []) map.set(row.id, diffChanges(row.old_data, row.new_data));
  return map;
}

/** Recent activity by one user (detail pages). */
export async function listUserActivity(userId: string, limit = 15): Promise<ActivityFeedEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activity_feed")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(toFriendlyError(error, "We couldn't load recent activity.", "activity.user"));
  return (data ?? []) as unknown as ActivityFeedEntry[];
}

export type FilterOption = { value: string; label: string };

export async function getActivityFilterOptions(
  user: CurrentUser,
): Promise<{ users: FilterOption[]; projects: FilterOption[] }> {
  const supabase = await createClient();
  const [usersRes, projectsRes] = await Promise.all([
    // Owner: every person incl. deactivated ones (their history stays searchable).
    user.role === "owner"
      ? supabase.from("profiles").select("id, full_name, employee_id, status").not("role", "is", null).order("full_name")
      : Promise.resolve({
          data: [] as { id: string; full_name: string; employee_id: string | null; status: string }[],
          error: null,
        }),
    supabase.from("project_directory").select("id, name, project_code").order("name").limit(500),
  ]);
  if (usersRes.error) throw new Error(toFriendlyError(usersRes.error, "We couldn't load filters.", "activity.users"));
  if (projectsRes.error) {
    throw new Error(toFriendlyError(projectsRes.error, "We couldn't load filters.", "activity.projects"));
  }
  return {
    users: (usersRes.data ?? []).map((u) => ({
      value: u.id,
      label: `${u.full_name}${u.employee_id ? ` (${u.employee_id})` : ""}${u.status === "inactive" ? " · inactive" : ""}`,
    })),
    projects: (projectsRes.data ?? []).map((p) => ({ value: p.id, label: `${p.project_code} · ${p.name}` })),
  };
}
