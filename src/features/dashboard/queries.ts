import "server-only";
import { cache } from "react";
import {
  MATERIAL_OPEN_STATUSES,
  ONGOING_PROJECT_STATUSES,
  UPCOMING_HANDOVER_DAYS,
} from "@/lib/constants";
import { addDays, todayIST } from "@/lib/dates";
import { toFriendlyError } from "@/lib/errors";
import { fetchPage } from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";
import type {
  AdminDashboardStats,
  AdminPerformanceRow,
  OwnerDashboardStats,
  SiteManagerDashboardStats,
  SiteManagerPerformanceRow,
} from "@/types/database";
import type {
  ActivityRow,
  AttentionProject,
  AttentionRequest,
  CountedList,
  GanttProject,
  HandoverProject,
  Loaded,
  QueueRequest,
  SmProject,
} from "./types";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function failed<T>(err: unknown, message: string, context: string): Loaded<T> {
  return { ok: false, error: toFriendlyError(err, message, context) };
}

/** The status filter for "not closed" projects (PostgREST `not.in` list). */
const CLOSED_PROJECT_FILTER = "(completed,cancelled)";
const CLOSED_REQUEST_FILTER = "(delivered,rejected,cancelled)";

/* -------------------------------------------------------------------------- */
/* Owner                                                                      */
/* -------------------------------------------------------------------------- */

/** Company KPIs (rpc get_owner_dashboard). Cached per request: several widgets share it. */
export const getOwnerStats = cache(async (): Promise<Loaded<OwnerDashboardStats>> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_owner_dashboard");
  if (error || !data) {
    return failed(error ?? new Error("empty"), "We couldn't load the company overview.", "dashboard.ownerStats");
  }
  const raw = data as Partial<OwnerDashboardStats>;
  return {
    ok: true,
    data: {
      total_clients: num(raw.total_clients),
      total_projects: num(raw.total_projects),
      ongoing_projects: num(raw.ongoing_projects),
      completed_projects: num(raw.completed_projects),
      on_hold_projects: num(raw.on_hold_projects),
      delayed_projects: num(raw.delayed_projects),
      upcoming_handovers: num(raw.upcoming_handovers),
      total_project_value: num(raw.total_project_value),
      material_estimated_cost: num(raw.material_estimated_cost),
      material_approved_cost: num(raw.material_approved_cost),
      material_actual_cost: num(raw.material_actual_cost),
      material_variance: num(raw.material_variance),
      material_variance_estimated_cost: num(raw.material_variance_estimated_cost),
      material_variance_actual_cost: num(raw.material_variance_actual_cost),
      pending_material_requests: num(raw.pending_material_requests),
      overdue_material_requests: num(raw.overdue_material_requests),
      status_breakdown: (raw.status_breakdown ?? []).map((item) => ({
        status: item.status,
        count: num(item.count),
      })),
      monthly_material_cost: (raw.monthly_material_cost ?? []).map((item) => ({
        month: item.month,
        estimated: num(item.estimated),
        actual: num(item.actual),
      })),
    },
  };
});

/** Site manager performance (rpc get_site_manager_performance, owner only). */
export const getSiteManagerPerformance = cache(async (): Promise<Loaded<SiteManagerPerformanceRow[]>> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_site_manager_performance");
  if (error) return failed(error, "We couldn't load site manager performance.", "dashboard.smPerformance");
  return {
    ok: true,
    data: (data ?? []).map((row) => ({
      ...row,
      assigned_projects: num(row.assigned_projects),
      ongoing_projects: num(row.ongoing_projects),
      completed_projects: num(row.completed_projects),
      delayed_projects: num(row.delayed_projects),
      on_time_completed: num(row.on_time_completed),
      on_time_rate: numOrNull(row.on_time_rate),
      avg_progress: numOrNull(row.avg_progress),
      material_requests_created: num(row.material_requests_created),
      avg_request_completion_days: numOrNull(row.avg_request_completion_days),
      project_updates_count: num(row.project_updates_count),
    })),
  };
});

/** Admin performance (rpc get_admin_performance, owner only). */
export const getAdminPerformance = cache(async (): Promise<Loaded<AdminPerformanceRow[]>> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_admin_performance");
  if (error) return failed(error, "We couldn't load admin performance.", "dashboard.adminPerformance");
  return {
    ok: true,
    data: (data ?? []).map((row) => ({
      ...row,
      requests_assigned: num(row.requests_assigned),
      pending: num(row.pending),
      processing: num(row.processing),
      completed: num(row.completed),
      rejected: num(row.rejected),
      overdue: num(row.overdue),
      completion_rate: numOrNull(row.completion_rate),
      avg_response_hours: numOrNull(row.avg_response_hours),
      avg_completion_days: numOrNull(row.avg_completion_days),
      total_value_managed: numOrNull(row.total_value_managed),
    })),
  };
});

export const GANTT_LIMIT = 12;

/** Ongoing projects with the nearest deadlines, for the timeline chart. */
export async function getTimelineProjects(): Promise<Loaded<CountedList<GanttProject>>> {
  const supabase = await createClient();
  const { data, error, count } = await supabase
    .from("project_directory")
    .select(
      "id, project_code, name, client_name, status, progress_percentage, start_date, expected_completion_date, handover_date, is_overdue, created_at",
      { count: "exact" },
    )
    .is("archived_at", null)
    .in("status", [...ONGOING_PROJECT_STATUSES])
    .order("expected_completion_date", { ascending: true, nullsFirst: false })
    .order("project_code", { ascending: true })
    .limit(GANTT_LIMIT);
  if (error) return failed(error, "We couldn't load the project timeline.", "dashboard.timeline");
  return { ok: true, data: { rows: data ?? [], total: count ?? data?.length ?? 0 } };
}

export type AttentionData = {
  projects: CountedList<AttentionProject>;
  requests: CountedList<AttentionRequest>;
};

/** Overdue / delayed projects plus overdue or high-priority open material requests. */
export async function getNeedsAttention(limit = 5): Promise<Loaded<AttentionData>> {
  const supabase = await createClient();
  const today = todayIST();
  const [projects, requests] = await Promise.all([
    supabase
      .from("project_directory")
      .select("id, project_code, name, client_name, status, deadline_date, is_overdue, site_manager_name", {
        count: "exact",
      })
      .is("archived_at", null)
      .not("status", "in", CLOSED_PROJECT_FILTER)
      .or("is_overdue.eq.true,status.eq.delayed")
      .order("expected_completion_date", { ascending: true, nullsFirst: false })
      .limit(limit),
    supabase
      .from("material_request_directory")
      .select(
        "id, request_code, title, project_code, project_name, status, priority, required_date, required_state, items_summary",
        { count: "exact" },
      )
      .is("archived_at", null)
      .in("status", [...MATERIAL_OPEN_STATUSES])
      .or(`required_date.lt.${today},priority.in.(high,urgent)`)
      .order("required_date", { ascending: true })
      .order("priority", { ascending: false })
      .limit(limit),
  ]);
  if (projects.error) return failed(projects.error, "We couldn't load items needing attention.", "dashboard.attention.projects");
  if (requests.error) return failed(requests.error, "We couldn't load items needing attention.", "dashboard.attention.requests");
  return {
    ok: true,
    data: {
      projects: { rows: projects.data ?? [], total: projects.count ?? 0 },
      requests: { rows: requests.data ?? [], total: requests.count ?? 0 },
    },
  };
}

/**
 * Projects whose handover (or, without one, expected completion) falls within the next
 * 30 days and that are not closed — the same rule `get_owner_dashboard` counts.
 */
export async function getUpcomingHandovers(limit = 6): Promise<Loaded<CountedList<HandoverProject>>> {
  const supabase = await createClient();
  const today = todayIST();
  const until = addDays(today, UPCOMING_HANDOVER_DAYS);
  // handover_or_deadline = coalesce(handover_date, expected_completion_date): filtering and
  // ordering on it in the database keeps the nearest handovers when the list is limited.
  const { data, error, count } = await supabase
    .from("project_directory")
    .select(
      "id, project_code, name, client_name, status, handover_date, expected_completion_date, handover_or_deadline, progress_percentage",
      { count: "exact" },
    )
    .is("archived_at", null)
    .not("status", "in", CLOSED_PROJECT_FILTER)
    .gte("handover_or_deadline", today)
    .lte("handover_or_deadline", until)
    .order("handover_or_deadline", { ascending: true })
    .order("project_code", { ascending: true })
    .limit(limit);
  if (error) return failed(error, "We couldn't load upcoming handovers.", "dashboard.handovers");
  const rows = data ?? [];
  return { ok: true, data: { rows, total: count ?? rows.length } };
}

/* -------------------------------------------------------------------------- */
/* Shared                                                                     */
/* -------------------------------------------------------------------------- */

/** Latest audit entries visible to the caller (activity_feed applies audit RLS). */
export async function getRecentActivity(limit = 8): Promise<Loaded<ActivityRow[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activity_feed")
    .select("id, user_id, actor_name, entity_type, entity_id, project_id, summary, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return failed(error, "We couldn't load recent activity.", "dashboard.activity");
  return { ok: true, data: data ?? [] };
}

/* -------------------------------------------------------------------------- */
/* Site manager                                                               */
/* -------------------------------------------------------------------------- */

export const getSiteManagerStats = cache(async (): Promise<Loaded<SiteManagerDashboardStats>> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_site_manager_dashboard");
  if (error || !data) {
    return failed(error ?? new Error("empty"), "We couldn't load your project summary.", "dashboard.smStats");
  }
  const raw = data as Partial<SiteManagerDashboardStats>;
  return {
    ok: true,
    data: {
      my_projects: num(raw.my_projects),
      active_projects: num(raw.active_projects),
      near_deadline: num(raw.near_deadline),
      overdue_projects: num(raw.overdue_projects),
      pending_material_requests: num(raw.pending_material_requests),
      delivered_materials: num(raw.delivered_materials),
    },
  };
});

export const SM_PROJECT_LIMIT = 12;

/** The site manager's open (not completed/cancelled) assigned projects, nearest deadline first. */
export const getSiteManagerProjects = cache(
  async (userId: string): Promise<Loaded<CountedList<SmProject>>> => {
    const supabase = await createClient();
    const { data, error, count } = await supabase
      .from("project_directory")
      .select(
        "id, project_code, name, client_name, city, status, progress_percentage, handover_date, deadline_date, expected_completion_date, deadline_state, current_milestone, open_material_requests, total_material_requests",
        { count: "exact" },
      )
      .is("archived_at", null)
      .contains("site_manager_ids", [userId])
      .not("status", "in", CLOSED_PROJECT_FILTER)
      .order("expected_completion_date", { ascending: true, nullsFirst: false })
      .order("project_code", { ascending: true })
      .limit(SM_PROJECT_LIMIT);
    if (error) return failed(error, "We couldn't load your projects.", "dashboard.smProjects");
    return { ok: true, data: { rows: data ?? [], total: count ?? data?.length ?? 0 } };
  },
);

/** Open material requests on the site manager's projects (RLS-scoped), most urgent first. */
export async function getOpenRequestsForSiteManager(limit = 6): Promise<Loaded<CountedList<AttentionRequest>>> {
  const supabase = await createClient();
  const { data, error, count } = await supabase
    .from("material_request_directory")
    .select(
      "id, request_code, title, project_code, project_name, status, priority, required_date, required_state, items_summary",
      { count: "exact" },
    )
    .is("archived_at", null)
    .in("status", [...MATERIAL_OPEN_STATUSES])
    .order("required_date", { ascending: true })
    .order("priority", { ascending: false })
    .limit(limit);
  if (error) return failed(error, "We couldn't load your material requests.", "dashboard.smRequests");
  return { ok: true, data: { rows: data ?? [], total: count ?? 0 } };
}

/* -------------------------------------------------------------------------- */
/* Admin                                                                      */
/* -------------------------------------------------------------------------- */

export async function getAdminStats(): Promise<Loaded<AdminDashboardStats>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_admin_dashboard");
  if (error || !data) {
    return failed(error ?? new Error("empty"), "We couldn't load your request summary.", "dashboard.adminStats");
  }
  const raw = data as Partial<AdminDashboardStats>;
  return {
    ok: true,
    data: {
      new_requests: num(raw.new_requests),
      pending_requests: num(raw.pending_requests),
      approved: num(raw.approved),
      ordered: num(raw.ordered),
      partially_delivered: num(raw.partially_delivered),
      completed: num(raw.completed),
      overdue_requests: num(raw.overdue_requests),
      unassigned: num(raw.unassigned),
    },
  };
}

/**
 * Admin work queue: open requests visible to the admin, most urgent first
 * (required date ascending, then priority). Never selects cost columns.
 */
export async function getAdminWorkQueue(
  page: number,
  pageSize: number,
): Promise<Loaded<CountedList<QueueRequest>>> {
  const supabase = await createClient();
  const build = (head = false) =>
    supabase
      .from("material_request_directory")
      .select(
        "id, request_code, title, project_id, project_code, project_name, items_summary, item_count, required_date, priority, status, requested_by_name, assigned_admin, assigned_admin_name",
        { count: "exact", head },
      )
      .is("archived_at", null)
      .not("status", "in", CLOSED_REQUEST_FILTER);
  // A stale ?queuePage past the end falls back to the last page instead of an error.
  const { rows: requests, total, page: shownPage, error } = await fetchPage(
    page,
    pageSize,
    (from, to) =>
      build()
        .order("required_date", { ascending: true })
        .order("priority", { ascending: false })
        .order("request_code", { ascending: true })
        .range(from, to),
    () => build(true),
  );
  if (error) return failed(error, "We couldn't load the work queue.", "dashboard.adminQueue");

  // Quantities for the visible page only (≤ pageSize requests, so a short id list).
  const firstItems = new Map<string, { quantity: number; unit: string }>();
  if (requests.length > 0) {
    const { data: items, error: itemsError } = await supabase
      .from("material_request_items")
      .select("request_id, quantity, unit, created_at")
      .in(
        "request_id",
        requests.map((r) => r.id),
      )
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(1000);
    if (itemsError) return failed(itemsError, "We couldn't load the work queue.", "dashboard.adminQueue.items");
    for (const item of items ?? []) {
      if (!firstItems.has(item.request_id)) {
        firstItems.set(item.request_id, { quantity: num(item.quantity), unit: item.unit });
      }
    }
  }
  return {
    ok: true,
    data: {
      rows: requests.map((r) => ({ ...r, firstItem: firstItems.get(r.id) ?? null })),
      total,
      page: shownPage,
    },
  };
}
