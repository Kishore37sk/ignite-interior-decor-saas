import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { num, rpc, rpcScalar, TestDatabase, type TestUser } from "./harness";
import { appError } from "./fixtures";

/**
 * Small, fully controlled fixture for dashboard and performance numbers.
 * Requests are inserted directly (as the database owner) so timestamps are exact.
 */
let t: TestDatabase;
let owner: TestUser;
let smA: TestUser;
let smB: TestUser;
let adminA: TestUser;
let adminB: TestUser;
const p: Record<string, string> = {};
const r: Record<string, string> = {};

interface RequestSeed {
  project: string;
  requestedBy: string;
  assignedAdmin: string | null;
  status: string;
  requiredOffset: number;
  qty: number;
  est: number;
  approved?: number;
  actual?: number;
  reviewHours?: number;
  completeDays?: number;
}

async function seedRequest(key: string, seed: RequestSeed): Promise<void> {
  const row = await t.one<{ id: string }>(
    `insert into public.material_requests (
       project_id, requested_by, assigned_admin, title, required_date, status, requested_at,
       reviewed_at, approved_at, rejected_at, completed_at, rejection_reason)
     values ($1, $2, $3, $4, public.app_today() + $5::int, $6::public.material_request_status,
             now() - interval '10 days',
             case when $7::numeric is null then null else now() - interval '10 days' + make_interval(hours => $7::int) end,
             case when $6 in ('approved', 'ordered', 'partially_delivered', 'delivered') and $7::numeric is not null
                  then now() - interval '10 days' + make_interval(hours => $7::int) end,
             case when $6 = 'rejected' then now() - interval '10 days' + make_interval(hours => $7::int) end,
             case when $8::numeric is null then null else now() - interval '10 days' + make_interval(days => $8::int) end,
             case when $6 = 'rejected' then 'Not required' end)
     returning id`,
    [
      seed.project,
      seed.requestedBy,
      seed.assignedAdmin,
      `Request ${key}`,
      seed.requiredOffset,
      seed.status,
      seed.reviewHours ?? null,
      seed.completeDays ?? null,
    ],
  );
  await t.sql(
    `insert into public.material_request_items (request_id, material_name, quantity, unit, estimated_unit_cost,
                                                approved_unit_cost, actual_unit_cost, delivered_quantity)
     values ($1, $2, $3::numeric, 'Units', $4::numeric, $5::numeric, $6::numeric,
             case when $7::text = 'delivered' then $3::numeric else 0 end)`,
    [row.id, `Material ${key}`, seed.qty, seed.est, seed.approved ?? null, seed.actual ?? null, seed.status],
  );
  r[key] = row.id;
}

beforeAll(async () => {
  t = await TestDatabase.create();
  owner = await t.createUser("owner", "Kishore");
  smA = await t.createUser("site_manager", "Site Manager 01", { employeeId: "SM001" });
  smB = await t.createUser("site_manager", "Site Manager 02", { employeeId: "SM002" });
  adminA = await t.createUser("admin", "Admin 01", { employeeId: "AD001" });
  adminB = await t.createUser("admin", "Admin 02", { employeeId: "AD002" });

  const c1 = await t.createClient("Kumar", { email: "kumar@example.in" });
  const c2 = await t.createClient("Arun", { email: "arun@example.in" });
  const c3 = await t.createClient("Priya", { email: "priya@example.in" });
  await t.createClient("Archived Client", { archived: true });

  p.p1 = await t.createProject(c1, { name: "Kumar Residence", status: "execution", progress: 50, deadlineOffset: 5, cost: 1_000_000 });
  p.p2 = await t.createProject(c2, {
    name: "Arun Villa",
    status: "completed",
    progress: 100,
    startOffset: -100,
    deadlineOffset: -10,
    handoverOffset: -10,
    actualHandoverOffset: -12,
    cost: 500_000,
  });
  p.p3 = await t.createProject(c2, {
    name: "Arun Office",
    status: "completed",
    progress: 100,
    startOffset: -100,
    deadlineOffset: -30,
    handoverOffset: -30,
    actualHandoverOffset: -20,
    cost: 300_000,
  });
  p.p4 = await t.createProject(c3, { name: "Priya Apartment", status: "delayed", progress: 40, deadlineOffset: -5, cost: 2_000_000 });
  p.p5 = await t.createProject(c3, { name: "Priya Studio", status: "on_hold", progress: 10, deadlineOffset: -2, cost: 700_000 });
  p.p6 = await t.createProject(c3, { name: "Priya Farmhouse", status: "planning", progress: 0, deadlineOffset: null, handoverOffset: 12, cost: 0 });
  p.p7 = await t.createProject(c1, { name: "Kumar Shop", status: "cancelled", progress: 5, cost: 200_000 });

  for (const key of ["p1", "p2", "p3"]) await t.addMember(p[key] as string, smA.id, "site_manager");
  for (const key of ["p4", "p5", "p6"]) await t.addMember(p[key] as string, smB.id, "site_manager");

  await seedRequest("r1", {
    project: p.p1 as string, requestedBy: smA.id, assignedAdmin: adminA.id, status: "delivered", requiredOffset: -3,
    qty: 10, est: 100, approved: 100, actual: 120, reviewHours: 2, completeDays: 4,
  });
  await seedRequest("r2", {
    project: p.p1 as string, requestedBy: smA.id, assignedAdmin: adminA.id, status: "requested", requiredOffset: -1, qty: 5, est: 100,
  });
  await seedRequest("r3", {
    project: p.p4 as string, requestedBy: smB.id, assignedAdmin: adminB.id, status: "rejected", requiredOffset: 4,
    qty: 3, est: 100, reviewHours: 4,
  });
  await seedRequest("r4", {
    project: p.p4 as string, requestedBy: smB.id, assignedAdmin: adminB.id, status: "ordered", requiredOffset: 3,
    qty: 20, est: 100, approved: 95, reviewHours: 6,
  });
  await seedRequest("r5", {
    project: p.p5 as string, requestedBy: smB.id, assignedAdmin: null, status: "requested", requiredOffset: 10, qty: 8, est: 100,
  });
});

afterAll(async () => {
  await t?.close();
});

describe("get_owner_dashboard", () => {
  it("returns correct totals for the fixture", async () => {
    const rows = await t.asUser(owner.id, (tx) => rpcScalar<Record<string, unknown>>(tx, "get_owner_dashboard"));
    expect(rows).toMatchObject({
      total_clients: 3,
      total_projects: 7,
      ongoing_projects: 3,
      completed_projects: 2,
      on_hold_projects: 1,
      delayed_projects: 2,
      upcoming_handovers: 2,
      total_project_value: 4_500_000,
      material_estimated_cost: 4300,
      material_approved_cost: 2900,
      material_actual_cost: 1200,
      pending_material_requests: 2,
      overdue_material_requests: 1,
    });
    const breakdown = rows.status_breakdown as Array<{ status: string; count: number }>;
    expect(Object.fromEntries(breakdown.map((b) => [b.status, b.count]))).toEqual({
      planning: 1,
      execution: 1,
      completed: 2,
      on_hold: 1,
      delayed: 1,
      cancelled: 1,
    });
    const monthly = rows.monthly_material_cost as Array<{ month: string; estimated: number; actual: number }>;
    expect(monthly).toHaveLength(6);
    expect(monthly.reduce((sum, m) => sum + m.estimated, 0)).toBe(4300);
    expect(monthly.reduce((sum, m) => sum + m.actual, 0)).toBe(1200);
    expect(monthly.map((m) => m.month)).toEqual([...monthly.map((m) => m.month)].sort());
  });

  it("is owner-only", async () => {
    await expect(t.asUser(smA.id, (tx) => rpc(tx, "get_owner_dashboard"))).rejects.toThrow(appError("NOT_AUTHORIZED"));
    await expect(t.asUser(adminA.id, (tx) => rpc(tx, "get_site_manager_performance"))).rejects.toThrow(
      appError("NOT_AUTHORIZED"),
    );
    await expect(t.asUser(smA.id, (tx) => rpc(tx, "get_admin_performance"))).rejects.toThrow(appError("NOT_AUTHORIZED"));
  });
});

describe("performance analytics", () => {
  it("computes site manager performance", async () => {
    const rows = await t.asUser(owner.id, (tx) => rpc<Record<string, unknown>>(tx, "get_site_manager_performance"));
    const a = rows.find((row) => row.user_id === smA.id);
    const b = rows.find((row) => row.user_id === smB.id);
    expect(a).toMatchObject({
      employee_id: "SM001",
      status: "active",
      assigned_projects: 3,
      ongoing_projects: 1,
      completed_projects: 2,
      delayed_projects: 0,
      on_time_completed: 1,
      material_requests_created: 2,
      last_update_at: null,
    });
    expect(num(a?.on_time_rate)).toBe(50);
    expect(num(a?.avg_progress)).toBe(83.3);
    expect(num(a?.avg_request_completion_days)).toBe(4);

    expect(b).toMatchObject({
      assigned_projects: 3,
      ongoing_projects: 2,
      completed_projects: 0,
      // p4 is delayed; the overdue on-hold p5 is outside the ongoing population.
      delayed_projects: 1,
      on_time_completed: 0,
      on_time_rate: null,
      material_requests_created: 3,
      avg_request_completion_days: null,
    });
    expect(num(b?.avg_progress)).toBe(16.7);
  });

  it("computes admin performance", async () => {
    const rows = await t.asUser(owner.id, (tx) => rpc<Record<string, unknown>>(tx, "get_admin_performance"));
    const a = rows.find((row) => row.user_id === adminA.id);
    const b = rows.find((row) => row.user_id === adminB.id);
    expect(a).toMatchObject({ requests_assigned: 2, pending: 1, processing: 0, completed: 1, rejected: 0, overdue: 1 });
    expect(num(a?.completion_rate)).toBe(50);
    expect(num(a?.avg_response_hours)).toBe(2);
    expect(num(a?.avg_completion_days)).toBe(4);
    expect(num(a?.total_value_managed)).toBe(1700);

    expect(b).toMatchObject({ requests_assigned: 2, pending: 0, processing: 1, completed: 0, rejected: 1, overdue: 0 });
    expect(num(b?.completion_rate)).toBe(0);
    expect(num(b?.avg_response_hours)).toBe(5);
    expect(b?.avg_completion_days).toBeNull();
    expect(num(b?.total_value_managed)).toBe(1900);
  });
});

describe("role dashboards", () => {
  it("site manager dashboard counts only their own projects", async () => {
    const a = await t.asUser(smA.id, (tx) => rpcScalar<Record<string, number>>(tx, "get_site_manager_dashboard"));
    expect(a).toEqual({
      my_projects: 3,
      active_projects: 1,
      near_deadline: 1,
      overdue_projects: 0,
      pending_material_requests: 1,
      delivered_materials: 1,
    });
    const b = await t.asUser(smB.id, (tx) => rpcScalar<Record<string, number>>(tx, "get_site_manager_dashboard"));
    expect(b).toEqual({
      my_projects: 3,
      active_projects: 2,
      near_deadline: 0,
      overdue_projects: 2,
      pending_material_requests: 1,
      delivered_materials: 0,
    });
    await expect(t.asUser(adminA.id, (tx) => rpc(tx, "get_site_manager_dashboard"))).rejects.toThrow(
      appError("NOT_AUTHORIZED"),
    );
  });

  it("admin dashboard counts assigned and unassigned requests only", async () => {
    const a = await t.asUser(adminA.id, (tx) => rpcScalar<Record<string, number>>(tx, "get_admin_dashboard"));
    expect(a).toEqual({
      new_requests: 2,
      pending_requests: 2,
      approved: 0,
      ordered: 0,
      partially_delivered: 0,
      completed: 1,
      overdue_requests: 1,
      unassigned: 1,
    });
    const b = await t.asUser(adminB.id, (tx) => rpcScalar<Record<string, number>>(tx, "get_admin_dashboard"));
    expect(b).toEqual({
      new_requests: 1,
      pending_requests: 1,
      approved: 0,
      ordered: 1,
      partially_delivered: 0,
      completed: 0,
      overdue_requests: 0,
      unassigned: 1,
    });
    await expect(t.asUser(smA.id, (tx) => rpc(tx, "get_admin_dashboard"))).rejects.toThrow(appError("NOT_AUTHORIZED"));
  });
});

describe("read models", () => {
  it("project_material_summary and project_financial_summary aggregate correctly", async () => {
    const summary = await t.asUser(owner.id, (tx) =>
      tx.query<Record<string, unknown>>("select * from public.project_material_summary where project_id = $1", [p.p1 as string]),
    );
    const row = summary.rows[0];
    expect(row).toMatchObject({ total_requests: 2, pending_requests: 1, delivered_requests: 1 });
    expect(num(row?.pending_material_cost)).toBe(500);
    expect(num(row?.approved_material_cost)).toBe(1000);
    expect(num(row?.actual_material_cost)).toBe(1200);

    const fin = await t.asUser(owner.id, (tx) =>
      tx.query<Record<string, unknown>>("select * from public.project_financial_summary where project_id = $1", [p.p1 as string]),
    );
    expect(num(fin.rows[0]?.project_cost)).toBe(1_000_000);
    expect(num(fin.rows[0]?.material_estimated_cost)).toBe(1500);
    // Like-for-like: only r1 has actual costs (est 1000, actual 1200); r2's open estimate does not offset it.
    expect(num(fin.rows[0]?.material_variance)).toBe(200);
    expect(num(fin.rows[0]?.material_variance_estimated_cost)).toBe(1000);
    expect(num(fin.rows[0]?.material_variance_actual_cost)).toBe(1200);
  });

  it("material_request_directory derives required_state", async () => {
    const rows = await t.asUser(owner.id, (tx) =>
      tx.query<{ id: string; required_state: string; days_until_required: number }>(
        "select id, required_state, days_until_required from public.material_request_directory",
      ),
    );
    const state = Object.fromEntries(rows.rows.map((row) => [row.id, row.required_state]));
    expect(state[r.r1 as string]).toBe("closed");
    expect(state[r.r2 as string]).toBe("overdue");
    expect(state[r.r3 as string]).toBe("closed");
    expect(state[r.r4 as string]).toBe("due_soon");
    expect(state[r.r5 as string]).toBe("upcoming");
    expect(rows.rows.find((row) => row.id === r.r2)?.days_until_required).toBe(-1);
  });

  it("client_directory shows latest project and site manager", async () => {
    const rows = await t.asUser(smB.id, (tx) =>
      tx.query<Record<string, unknown>>("select name, project_count, active_project_count, site_manager_name from public.client_directory"),
    );
    expect(rows.rows).toEqual([
      { name: "Priya", project_count: 3, active_project_count: 2, site_manager_name: "Site Manager 02" },
    ]);
  });

  it("project_directory derives days_remaining and deadline_state", async () => {
    const client = await t.createClient("Deadline Client");
    const cases: Array<[number | null, string, string]> = [
      [0, "execution", "due_today"],
      [1, "execution", "due_tomorrow"],
      [3, "execution", "due_7"],
      [10, "execution", "due_14"],
      [20, "execution", "due_30"],
      [45, "execution", "on_track"],
      [-4, "finishing", "overdue"],
      [null, "planning", "no_date"],
      [-50, "completed", "completed"],
      [-50, "cancelled", "cancelled"],
    ];
    const created: Array<{ id: string; offset: number | null; status: string; state: string }> = [];
    for (const [offset, status, state] of cases) {
      const id = await t.createProject(client, { name: `Deadline ${state}`, status, deadlineOffset: offset, startOffset: -100 });
      created.push({ id, offset, status, state });
    }
    const rows = await t.asUser(owner.id, (tx) =>
      tx.query<{ id: string; deadline_state: string; days_remaining: number | null; is_overdue: boolean; site_manager_ids: string[] }>(
        "select id, deadline_state, days_remaining, is_overdue, site_manager_ids from public.project_directory",
      ),
    );
    const byId = new Map(rows.rows.map((row) => [row.id, row]));
    for (const c of created) {
      const row = byId.get(c.id);
      expect(row?.deadline_state, c.state).toBe(c.state);
      expect(row?.days_remaining, c.state).toBe(c.offset);
      expect(row?.is_overdue, c.state).toBe(c.state === "overdue");
      expect(row?.site_manager_ids).toEqual([]);
    }
    const p1 = byId.get(p.p1 as string);
    expect(p1?.site_manager_ids).toEqual([smA.id]);
  });
});

describe("project scope of work (0011)", () => {
  it("stores known scope keys and exposes them in project_directory", async () => {
    await t.sql("update public.projects set work_scope = array['living_room', 'modular_kitchen'] where id = $1", [
      p.p1 as string,
    ]);
    const row = await t.asUser(owner.id, (tx) =>
      tx.query<{ work_scope: string[] }>("select work_scope from public.project_directory where id = $1", [p.p1 as string]),
    );
    expect(row.rows[0]?.work_scope).toEqual(["living_room", "modular_kitchen"]);
  });

  it("defaults to an empty scope and rejects unknown keys", async () => {
    const fresh = await t.one<{ work_scope: string[] }>(
      "select work_scope from public.projects where id <> $1 limit 1",
      [p.p1 as string],
    );
    expect(fresh.work_scope).toEqual([]);
    await expect(
      t.sql("update public.projects set work_scope = array['garage'] where id = $1", [p.p1 as string]),
    ).rejects.toThrow(/projects_work_scope_chk/);
  });
});
