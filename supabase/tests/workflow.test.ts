import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { count, num, rpc, rpcScalar, TestDatabase } from "./harness";
import { appError, assignRequest, buildWorld, createRequest, type World } from "./fixtures";

let t: TestDatabase;
let w: World;

beforeAll(async () => {
  t = await TestDatabase.create();
  w = await buildWorld(t);
});

afterAll(async () => {
  await t?.close();
});

interface RequestRow {
  status: string;
  assigned_admin: string | null;
  estimated_cost: string | null;
  approved_cost: string | null;
  actual_cost: string | null;
  reviewed_at: Date | null;
  approved_at: Date | null;
  ordered_at: Date | null;
  completed_at: Date | null;
  rejected_at: Date | null;
  cancelled_at: Date | null;
  rejection_reason: string | null;
  expected_delivery_date: string | null;
  delivery_date: string | null;
  client_id: string;
  request_code: string;
}

const loadRequest = (id: string): Promise<RequestRow> =>
  t.one<RequestRow>(
    `select status, assigned_admin, estimated_cost, approved_cost, actual_cost, reviewed_at, approved_at, ordered_at,
            completed_at, rejected_at, cancelled_at, rejection_reason, expected_delivery_date::text,
            delivery_date::text, client_id, request_code
     from public.material_requests where id = $1`,
    [id],
  );

const notificationTypes = async (userId: string, entityId: string): Promise<string[]> => {
  const rows = await t.sql<{ type: string }>(
    "select type from public.notifications where user_id = $1 and entity_id = $2 order by created_at, type",
    [userId, entityId],
  );
  return rows.map((r) => r.type);
};

const updateArgs = (projectId: string, overrides: Record<string, string | number | null> = {}) => ({
  p_project_id: projectId,
  p_status: "finishing",
  p_progress: 72,
  p_update_date: null,
  p_milestone: "Finishing",
  p_expected_completion_date: null,
  p_issues: "Tile delivery pending for bathroom 2.",
  p_notes: "False ceiling completed in living room.",
  p_next_action: "Start painting",
  ...overrides,
});

describe("submit_project_update", () => {
  it("writes history, updates the project and audits a readable summary", async () => {
    const updateId = await t.asUser(w.sm1.id, (tx) => rpcScalar<string>(tx, "submit_project_update", updateArgs(w.projectA)));

    const history = await t.one<Record<string, unknown>>(
      "select status, previous_status, progress_percentage, previous_progress, updated_by, notes, update_date::text as update_date from public.project_updates where id = $1",
      [updateId],
    );
    expect(history).toMatchObject({
      status: "finishing",
      previous_status: "execution",
      updated_by: w.sm1.id,
      notes: "False ceiling completed in living room.",
      update_date: await t.today(),
    });
    expect(num(history.progress_percentage)).toBe(72);
    expect(num(history.previous_progress)).toBe(60);

    const project = await t.one<Record<string, unknown>>(
      "select status, progress_percentage, current_milestone, last_updated_by, last_update_at from public.projects where id = $1",
      [w.projectA],
    );
    expect(project).toMatchObject({ status: "finishing", current_milestone: "Finishing", last_updated_by: w.sm1.id });
    expect(num(project.progress_percentage)).toBe(72);
    expect(project.last_update_at).not.toBeNull();

    const audit = await t.sql<{ summary: string; action: string; project_id: string }>(
      "select summary, action, project_id from public.audit_logs where entity_id = $1",
      [updateId],
    );
    expect(audit).toEqual([
      {
        summary: "Site Manager Ravi updated progress of Kumar Residence from 60% to 72% and status from Execution to Finishing",
        action: "progress_update",
        project_id: w.projectA,
      },
    ]);
    // The derived projects row change is not double-logged.
    expect(await count(t.db, "public.audit_logs", "entity_type = 'projects' and entity_id = $1 and action <> 'insert'", [w.projectA])).toBe(0);
  });

  it("validates progress, dates and status permissions", async () => {
    await expect(
      t.asUser(w.sm1.id, (tx) => rpc(tx, "submit_project_update", updateArgs(w.projectA, { p_progress: 101 }))),
    ).rejects.toThrow(appError("VALIDATION"));
    await expect(
      t.asUser(w.sm1.id, (tx) => rpc(tx, "submit_project_update", updateArgs(w.projectA, { p_progress: -1 }))),
    ).rejects.toThrow(appError("VALIDATION"));
    const tomorrow = await t.dateOffset(1);
    await expect(
      t.asUser(w.sm1.id, (tx) => rpc(tx, "submit_project_update", updateArgs(w.projectA, { p_update_date: tomorrow }))),
    ).rejects.toThrow(appError("VALIDATION"));
    const beforeStart = await t.dateOffset(-400);
    await expect(
      t.asUser(w.sm1.id, (tx) =>
        rpc(tx, "submit_project_update", updateArgs(w.projectA, { p_expected_completion_date: beforeStart })),
      ),
    ).rejects.toThrow(appError("VALIDATION"));
    await expect(
      t.asUser(w.sm1.id, (tx) => rpc(tx, "submit_project_update", updateArgs(w.projectA, { p_status: "cancelled" }))),
    ).rejects.toThrow(appError("NOT_AUTHORIZED"));
    await expect(
      t.asUser(w.admin1.id, (tx) => rpc(tx, "submit_project_update", updateArgs(w.projectA))),
    ).rejects.toThrow(appError("NOT_AUTHORIZED"));
  });

  it("completing a project sets the actual handover date and then blocks site managers (PROJECT_CLOSED)", async () => {
    const client = await t.createClient("Arun", { email: "arun@example.in" });
    const project = await t.createProject(client, { name: "Arun Villa", status: "handover_pending", progress: 95 });
    await t.addMember(project, w.sm1.id, "site_manager");

    await t.asUser(w.sm1.id, (tx) =>
      rpc(tx, "submit_project_update", updateArgs(project, { p_status: "completed", p_progress: 100 })),
    );
    const row = await t.one<{ actual_handover_date: string; status: string }>(
      "select actual_handover_date::text, status from public.projects where id = $1",
      [project],
    );
    expect(row).toEqual({ actual_handover_date: await t.today(), status: "completed" });

    await expect(
      t.asUser(w.sm1.id, (tx) => rpc(tx, "submit_project_update", updateArgs(project, { p_progress: 100 }))),
    ).rejects.toThrow(appError("PROJECT_CLOSED"));
    await expect(
      createRequest(t, w.sm1.id, project, [{ material_name: "Wall Putty", quantity: 20, unit: "Kg" }]),
    ).rejects.toThrow(appError("PROJECT_CLOSED"));

    // The owner can still post a correction.
    await t.asUser(w.owner.id, (tx) =>
      rpc(tx, "submit_project_update", updateArgs(project, { p_status: "completed", p_progress: 100, p_notes: "Snag list closed" })),
    );
    expect(await count(t.db, "public.project_updates", "project_id = $1", [project])).toBe(2);
  });
});

describe("update_project_milestone", () => {
  it("lets the assigned site manager progress milestones with date validation", async () => {
    const milestone = await t.one<{ id: string }>(
      "select id from public.project_milestones where project_id = $1 and name = 'Execution'",
      [w.projectA],
    );
    const start = await t.dateOffset(-20);
    const target = await t.dateOffset(5);
    await t.asUser(w.sm1.id, (tx) =>
      rpc(tx, "update_project_milestone", {
        p_milestone_id: milestone.id,
        p_status: "completed",
        p_start_date: start,
        p_target_date: target,
        p_completed_date: null,
        p_notes: "Civil work done",
      }),
    );
    const row = await t.one<{ status: string; completed_date: string }>(
      "select status, completed_date::text from public.project_milestones where id = $1",
      [milestone.id],
    );
    expect(row).toEqual({ status: "completed", completed_date: await t.today() });

    await expect(
      t.asUser(w.sm1.id, (tx) =>
        rpc(tx, "update_project_milestone", {
          p_milestone_id: milestone.id,
          p_status: "in_progress",
          p_start_date: target,
          p_target_date: start,
          p_completed_date: null,
          p_notes: null,
        }),
      ),
    ).rejects.toThrow(appError("VALIDATION"));

    const otherMilestone = await t.one<{ id: string }>(
      "select id from public.project_milestones where project_id = $1 and sort_order = 2",
      [w.projectB],
    );
    await expect(
      t.asUser(w.sm1.id, (tx) =>
        rpc(tx, "update_project_milestone", {
          p_milestone_id: otherMilestone.id,
          p_status: "completed",
          p_start_date: null,
          p_target_date: null,
          p_completed_date: null,
          p_notes: null,
        }),
      ),
    ).rejects.toThrow(appError("NOT_AUTHORIZED"));
  });

  it("creates the eight default milestones and a financials row for every new project", async () => {
    const names = await t.sql<{ name: string }>(
      "select name from public.project_milestones where project_id = $1 order by sort_order",
      [w.projectB],
    );
    expect(names.map((n) => n.name)).toEqual([
      "Project Started",
      "Design",
      "Approval",
      "Procurement",
      "Execution",
      "Finishing",
      "Handover",
      "Completed",
    ]);
    expect(await count(t.db, "public.project_financials", "project_id = $1", [w.projectB])).toBe(1);
  });
});

describe("material request workflow", () => {
  it("runs requested -> pending_review -> approved -> ordered -> partially_delivered -> delivered", async () => {
    const requestId = await createRequest(
      t,
      w.sm1.id,
      w.projectA,
      [
        { material_name: "Emulsion Paint", quantity: 40, unit: "Litres", category: "Paint", estimated_unit_cost: 350 },
        { material_name: "LED Panel Light", quantity: 24, unit: "Units", category: "Lighting", estimated_unit_cost: 900 },
      ],
      { title: "Paint and lights for living room", priority: "urgent", requiredOffset: 7 },
    );

    let req = await loadRequest(requestId);
    expect(req.status).toBe("requested");
    expect(req.client_id).toBe(w.clientA);
    expect(num(req.estimated_cost)).toBe(40 * 350 + 24 * 900);
    expect(req.approved_cost).toBeNull();
    expect(req.actual_cost).toBeNull();
    expect(req.assigned_admin).toBeNull();
    expect(await notificationTypes(w.owner.id, requestId)).toEqual(["material_request_new"]);
    expect(await notificationTypes(w.admin1.id, requestId)).toEqual(["material_request_new"]);
    expect(await notificationTypes(w.admin2.id, requestId)).toEqual(["material_request_new"]);
    const ownerTitle = await t.one<{ title: string }>(
      "select title from public.notifications where user_id = $1 and entity_id = $2",
      [w.owner.id, requestId],
    );
    expect(ownerTitle.title).toBe(`Urgent priority material request ${req.request_code}`);

    // Unassigned: visible to both admins. admin1 reviews and is auto-assigned.
    await t.asUser(w.admin1.id, (tx) =>
      rpc(tx, "update_material_request_status", { p_request_id: requestId, p_status: "pending_review" }),
    );
    req = await loadRequest(requestId);
    expect(req.status).toBe("pending_review");
    expect(req.assigned_admin).toBe(w.admin1.id);
    expect(req.reviewed_at).not.toBeNull();
    expect(await t.asUser(w.admin2.id, (tx) => count(tx, "public.material_requests", "id = $1", [requestId]))).toBe(0);

    await t.asUser(w.admin1.id, (tx) =>
      rpc(tx, "update_material_request_status", { p_request_id: requestId, p_status: "approved" }),
    );
    req = await loadRequest(requestId);
    expect(req.status).toBe("approved");
    expect(req.approved_at).not.toBeNull();
    expect(num(req.approved_cost)).toBe(num(req.estimated_cost));

    const items = await t.sql<{ id: string; material_name: string }>(
      "select id, material_name from public.material_request_items where request_id = $1 order by material_name",
      [requestId],
    );
    const paint = items.find((i) => i.material_name === "Emulsion Paint");
    const lights = items.find((i) => i.material_name === "LED Panel Light");
    if (!paint || !lights) throw new Error("items missing");

    await t.asUser(w.admin1.id, (tx) =>
      rpc(tx, "update_material_request_costs", {
        p_request_id: requestId,
        p_items: [{ item_id: lights.id, approved_unit_cost: 850 }],
      }),
    );
    req = await loadRequest(requestId);
    expect(num(req.approved_cost)).toBe(40 * 350 + 24 * 850);
    expect(num(req.estimated_cost)).toBe(40 * 350 + 24 * 900);

    const expected = await t.dateOffset(4);
    await t.asUser(w.admin1.id, (tx) =>
      rpc(tx, "update_material_request_status", {
        p_request_id: requestId,
        p_status: "ordered",
        p_note: "PO raised with Asian Paints dealer",
        p_expected_delivery_date: expected,
      }),
    );
    req = await loadRequest(requestId);
    expect(req.status).toBe("ordered");
    expect(req.ordered_at).not.toBeNull();
    expect(req.expected_delivery_date).toBe(expected);
    expect(await count(t.db, "public.material_request_comments", "request_id = $1", [requestId])).toBe(1);

    const today = await t.today();
    await t.asUser(w.admin1.id, (tx) =>
      rpc(tx, "record_material_delivery", {
        p_request_id: requestId,
        p_delivery_date: today,
        p_items: [{ item_id: paint.id, delivered_quantity: 25 }],
      }),
    );
    req = await loadRequest(requestId);
    expect(req.status).toBe("partially_delivered");
    expect(req.delivery_date).toBe(today);
    expect(req.completed_at).toBeNull();

    // Over-delivery is rejected.
    await expect(
      t.asUser(w.admin1.id, (tx) =>
        rpc(tx, "record_material_delivery", {
          p_request_id: requestId,
          p_delivery_date: today,
          p_items: [{ item_id: paint.id, delivered_quantity: 16 }],
        }),
      ),
    ).rejects.toThrow(appError("VALIDATION"));

    await t.asUser(w.admin1.id, (tx) =>
      rpc(tx, "record_material_delivery", {
        p_request_id: requestId,
        p_delivery_date: today,
        p_items: [
          { item_id: paint.id, delivered_quantity: 15 },
          { item_id: lights.id, delivered_quantity: 24 },
        ],
      }),
    );
    req = await loadRequest(requestId);
    expect(req.status).toBe("delivered");
    expect(req.completed_at).not.toBeNull();
    expect(await count(t.db, "public.material_deliveries", "request_id = $1", [requestId])).toBe(3);

    // Actual costs above the estimate -> owner gets a single cost_overrun alert.
    await t.asUser(w.admin1.id, (tx) =>
      rpc(tx, "update_material_request_costs", {
        p_request_id: requestId,
        p_items: [
          { item_id: paint.id, actual_unit_cost: 380 },
          { item_id: lights.id, actual_unit_cost: 950 },
        ],
      }),
    );
    req = await loadRequest(requestId);
    expect(num(req.actual_cost)).toBe(40 * 380 + 24 * 950);
    expect(await notificationTypes(w.owner.id, requestId)).toEqual(["material_request_new", "cost_overrun"]);

    // Requester heard about each status change; owner did not create them.
    expect(await notificationTypes(w.sm1.id, requestId)).toEqual([
      "material_request_status",
      "material_request_status",
      "material_request_status",
      "material_request_status",
      "material_request_status",
    ]);

    // Closed requests cannot move again.
    await expect(
      t.asUser(w.admin1.id, (tx) =>
        rpc(tx, "update_material_request_status", { p_request_id: requestId, p_status: "ordered" }),
      ),
    ).rejects.toThrow(appError("INVALID_TRANSITION"));

    const directory = await t.asUser(w.sm1.id, (tx) =>
      tx.query<{ items_summary: string; item_count: number; required_state: string; assigned_admin_name: string }>(
        "select items_summary, item_count, required_state, assigned_admin_name from public.material_request_directory where id = $1",
        [requestId],
      ),
    );
    expect(directory.rows[0]).toEqual({
      items_summary: "Emulsion Paint 40 Litres, LED Panel Light 24 Units",
      item_count: 2,
      required_state: "closed",
      assigned_admin_name: "Priya",
    });
  });

  it("rejects invalid transitions and enforces who may transition", async () => {
    const requestId = await createRequest(t, w.sm1.id, w.projectA, [
      { material_name: "Granite", quantity: 120, unit: "Sq Ft", estimated_unit_cost: 260 },
    ]);
    await expect(
      t.asUser(w.admin1.id, (tx) =>
        rpc(tx, "update_material_request_status", { p_request_id: requestId, p_status: "ordered" }),
      ),
    ).rejects.toThrow(appError("INVALID_TRANSITION"));
    await expect(
      t.asUser(w.admin1.id, (tx) =>
        rpc(tx, "update_material_request_status", { p_request_id: requestId, p_status: "delivered" }),
      ),
    ).rejects.toThrow(appError("INVALID_TRANSITION"));
    await expect(
      t.asUser(w.sm1.id, (tx) =>
        rpc(tx, "update_material_request_status", { p_request_id: requestId, p_status: "approved" }),
      ),
    ).rejects.toThrow(appError("NOT_AUTHORIZED"));
    await expect(
      t.asUser(w.admin1.id, (tx) =>
        rpc(tx, "record_material_delivery", {
          p_request_id: requestId,
          p_delivery_date: null,
          p_items: [],
        }),
      ),
    ).rejects.toThrow(appError("INVALID_TRANSITION"));
    await expect(
      t.asUser(w.sm1.id, (tx) =>
        rpc(tx, "update_material_request_costs", { p_request_id: requestId, p_items: [] }),
      ),
    ).rejects.toThrow(appError("NOT_AUTHORIZED"));

    // Rejection requires a reason; the owner and requester are told.
    await expect(
      t.asUser(w.admin1.id, (tx) =>
        rpc(tx, "update_material_request_status", { p_request_id: requestId, p_status: "rejected" }),
      ),
    ).rejects.toThrow(appError("VALIDATION"));
    await t.asUser(w.admin1.id, (tx) =>
      rpc(tx, "update_material_request_status", {
        p_request_id: requestId,
        p_status: "rejected",
        p_note: "Granite already in stock at the site.",
      }),
    );
    const req = await loadRequest(requestId);
    expect(req.status).toBe("rejected");
    expect(req.rejection_reason).toBe("Granite already in stock at the site.");
    expect(req.rejected_at).not.toBeNull();
    expect(await notificationTypes(w.sm1.id, requestId)).toEqual(["material_request_status"]);
    expect(await notificationTypes(w.owner.id, requestId)).toEqual(["material_request_new", "material_request_status"]);
  });

  it("lets the requester cancel only before approval and edit drafts atomically", async () => {
    const requestId = await createRequest(t, w.sm1.id, w.projectA, [
      { material_name: "Gypsum Board", quantity: 30, unit: "Sheets", estimated_unit_cost: 450 },
    ]);
    const required = await t.dateOffset(12);
    await t.asUser(w.sm1.id, (tx) =>
      rpc(tx, "update_material_request_draft", {
        p_request_id: requestId,
        p_title: "False ceiling boards",
        p_required_date: required,
        p_priority: "high",
        p_notes: "Bedroom 2",
        p_items: [
          { material_name: "Gypsum Board", quantity: 35, unit: "Sheets", estimated_unit_cost: 450 },
          { material_name: "Wall Putty", quantity: 40, unit: "Kg", estimated_unit_cost: 30 },
        ],
      }),
    );
    let req = await loadRequest(requestId);
    expect(num(req.estimated_cost)).toBe(35 * 450 + 40 * 30);
    expect(await count(t.db, "public.material_request_items", "request_id = $1", [requestId])).toBe(2);

    // A broken item list leaves the previous items untouched.
    await expect(
      t.asUser(w.sm1.id, (tx) =>
        rpc(tx, "update_material_request_draft", {
          p_request_id: requestId,
          p_title: "False ceiling boards",
          p_required_date: required,
          p_priority: "high",
          p_notes: null,
          p_items: [{ material_name: "Gypsum Board", quantity: 0, unit: "Sheets" }],
        }),
      ),
    ).rejects.toThrow(appError("VALIDATION"));
    expect(await count(t.db, "public.material_request_items", "request_id = $1", [requestId])).toBe(2);

    await expect(
      t.asUser(w.sm2.id, (tx) =>
        rpc(tx, "update_material_request_status", { p_request_id: requestId, p_status: "cancelled" }),
      ),
    ).rejects.toThrow(appError("NOT_AUTHORIZED"));

    await t.asUser(w.sm1.id, (tx) =>
      rpc(tx, "update_material_request_status", { p_request_id: requestId, p_status: "cancelled" }),
    );
    req = await loadRequest(requestId);
    expect(req.status).toBe("cancelled");
    expect(req.cancelled_at).not.toBeNull();

    await expect(
      t.asUser(w.sm1.id, (tx) =>
        rpc(tx, "update_material_request_draft", {
          p_request_id: requestId,
          p_title: "Too late",
          p_required_date: required,
          p_priority: "high",
          p_notes: null,
          p_items: [{ material_name: "Gypsum Board", quantity: 1, unit: "Sheets" }],
        }),
      ),
    ).rejects.toThrow(appError("INVALID_TRANSITION"));
  });

  it("detects duplicate open requests for the same material unless explicitly allowed", async () => {
    // requestA1 (Cement) is open on projectA.
    await expect(
      createRequest(t, w.sm1.id, w.projectA, [{ material_name: "  cement ", quantity: 50, unit: "Bags" }]),
    ).rejects.toThrow(appError("DUPLICATE_REQUEST"));

    const cementId = await t.one<{ id: string }>("select id from public.materials where name = 'Cement'");
    await expect(
      createRequest(t, w.sm1.id, w.projectA, [{ material_name: "", material_id: cementId.id, quantity: 50, unit: "" }]),
    ).rejects.toThrow(appError("DUPLICATE_REQUEST"));

    const allowed = await createRequest(
      t,
      w.sm1.id,
      w.projectA,
      [{ material_name: "Cement", quantity: 50, unit: "Bags" }],
      { allowDuplicate: true },
    );
    expect(allowed).toMatch(/^[0-9a-f-]{36}$/);

    // A different project is not a duplicate.
    await createRequest(t, w.sm2.id, w.projectB, [{ material_name: "Cement", quantity: 10, unit: "Bags" }]);
  });

  it("validates request input and rejects closed or archived projects and clients", async () => {
    await expect(
      createRequest(t, w.sm1.id, w.projectA, [{ material_name: "Sand", quantity: 10, unit: "Cu Ft" }], {
        requiredOffset: -1,
      }),
    ).rejects.toThrow(appError("VALIDATION"));
    await expect(createRequest(t, w.sm1.id, w.projectA, [])).rejects.toThrow(appError("VALIDATION"));
    await expect(
      createRequest(t, w.sm1.id, w.projectA, [{ material_name: "Sand", quantity: -5, unit: "Cu Ft" }]),
    ).rejects.toThrow(appError("VALIDATION"));
    await expect(
      createRequest(t, w.sm1.id, w.projectA, [
        { material_name: "Sand", quantity: 5, unit: "Cu Ft", material_id: "not-a-uuid" },
      ]),
    ).rejects.toThrow(appError("VALIDATION"));
    await expect(
      t.asUser(w.sm1.id, (tx) =>
        rpc(tx, "create_material_request", {
          p_project_id: w.projectA,
          p_title: "Bad cost",
          p_required_date: "2099-01-01",
          p_priority: "low",
          p_notes: null,
          p_items: [{ material_name: "Sand", quantity: 5, unit: "Cu Ft", estimated_unit_cost: "abc" }],
        }),
      ),
    ).rejects.toThrow(appError("VALIDATION"));

    const archivedClient = await t.createClient("Old Client", { archived: true });
    const projectOfArchived = await t.createProject(archivedClient, { name: "Legacy Flat" });
    await t.addMember(projectOfArchived, w.sm1.id, "site_manager");
    await expect(
      createRequest(t, w.sm1.id, projectOfArchived, [{ material_name: "Sand", quantity: 5, unit: "Cu Ft" }]),
    ).rejects.toThrow(appError("PROJECT_CLOSED"));

    const archivedProject = await t.createProject(w.clientA, { name: "Kumar Annex", archived: true });
    await t.addMember(archivedProject, w.sm1.id, "site_manager");
    await expect(
      createRequest(t, w.sm1.id, archivedProject, [{ material_name: "Sand", quantity: 5, unit: "Cu Ft" }]),
    ).rejects.toThrow(appError("PROJECT_CLOSED"));
  });

  it("supports the unassigned admin queue, claiming and owner assignment", async () => {
    const requestId = await createRequest(t, w.sm2.id, w.projectB, [
      { material_name: "Laminate Sheet", quantity: 20, unit: "Sheets", estimated_unit_cost: 1800 },
    ]);
    expect(await t.asUser(w.admin1.id, (tx) => count(tx, "public.material_requests", "id = $1", [requestId]))).toBe(1);
    expect(await t.asUser(w.admin2.id, (tx) => count(tx, "public.material_requests", "id = $1", [requestId]))).toBe(1);

    await t.asUser(w.admin1.id, (tx) =>
      rpc(tx, "assign_material_request", { p_request_id: requestId, p_admin_id: w.admin1.id }),
    );
    expect(await t.asUser(w.admin2.id, (tx) => count(tx, "public.material_requests", "id = $1", [requestId]))).toBe(0);
    await expect(
      t.asUser(w.admin2.id, (tx) =>
        rpc(tx, "assign_material_request", { p_request_id: requestId, p_admin_id: w.admin2.id }),
      ),
    ).rejects.toThrow(appError("NOT_AUTHORIZED"));

    await assignRequest(t, w.owner.id, requestId, w.admin2.id);
    expect(await notificationTypes(w.admin2.id, requestId)).toEqual(["material_request_new", "request_assigned"]);
    expect(await t.asUser(w.admin1.id, (tx) => count(tx, "public.material_requests", "id = $1", [requestId]))).toBe(0);

    await expect(assignRequest(t, w.owner.id, requestId, w.sm1.id)).rejects.toThrow(appError("VALIDATION"));
  });

  it("lets anyone with access comment and notifies the other party", async () => {
    const commentId = await t.asUser(w.admin1.id, (tx) =>
      rpcScalar<string>(tx, "add_material_request_comment", {
        p_request_id: w.requestA2,
        p_body: "Vendor confirms dispatch on Friday.",
      }),
    );
    expect(commentId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await notificationTypes(w.sm1.id, w.requestA2)).toContain("material_request_comment");
    await expect(
      t.asUser(w.admin1.id, (tx) => rpc(tx, "add_material_request_comment", { p_request_id: w.requestA2, p_body: "   " })),
    ).rejects.toThrow(appError("VALIDATION"));
  });
});

describe("team assignment and user status", () => {
  it("assigns, replaces and removes project members with notifications", async () => {
    const sm3 = await t.createUser("site_manager", "Manoj", { employeeId: "SM-06" });
    const client = await t.createClient("Iyer", { email: "iyer@example.in" });
    const project = await t.createProject(client, { name: "Iyer Duplex" });

    const first = await t.asUser(w.owner.id, (tx) =>
      rpcScalar<string>(tx, "assign_project_member", {
        p_project_id: project,
        p_user_id: w.sm2.id,
        p_member_role: "site_manager",
      }),
    );
    expect(await notificationTypes(w.sm2.id, project)).toEqual(["project_assigned"]);

    await t.asUser(w.owner.id, (tx) =>
      rpcScalar<string>(tx, "assign_project_member", {
        p_project_id: project,
        p_user_id: sm3.id,
        p_member_role: "site_manager",
        p_replace_existing: true,
      }),
    );
    const members = await t.sql<{ user_id: string; status: string }>(
      "select user_id, status from public.project_members where project_id = $1 order by assigned_at",
      [project],
    );
    expect(members).toEqual([
      { user_id: w.sm2.id, status: "removed" },
      { user_id: sm3.id, status: "active" },
    ]);
    expect(await t.asUser(w.sm2.id, (tx) => count(tx, "public.projects", "id = $1", [project]))).toBe(0);
    expect(await t.asUser(sm3.id, (tx) => count(tx, "public.projects", "id = $1", [project]))).toBe(1);
    expect(first).not.toBe(members[1]?.user_id);

    await expect(
      t.asUser(w.owner.id, (tx) =>
        rpc(tx, "assign_project_member", { p_project_id: project, p_user_id: w.admin1.id, p_member_role: "site_manager" }),
      ),
    ).rejects.toThrow(appError("VALIDATION"));
    await expect(
      t.asUser(w.sm1.id, (tx) =>
        rpc(tx, "assign_project_member", { p_project_id: project, p_user_id: w.sm1.id, p_member_role: "site_manager" }),
      ),
    ).rejects.toThrow(appError("NOT_AUTHORIZED"));

    await t.asUser(w.owner.id, (tx) => rpc(tx, "remove_project_member", { p_project_id: project, p_user_id: sm3.id }));
    expect(await t.asUser(sm3.id, (tx) => count(tx, "public.projects", "id = $1", [project]))).toBe(0);
    await expect(
      t.asUser(w.owner.id, (tx) => rpc(tx, "remove_project_member", { p_project_id: project, p_user_id: sm3.id })),
    ).rejects.toThrow(appError("NOT_FOUND"));

    // Inactive users cannot be assigned; history keeps their name.
    await t.asUser(w.owner.id, (tx) => rpc(tx, "set_user_status", { p_user_id: sm3.id, p_status: "inactive" }));
    await expect(
      t.asUser(w.owner.id, (tx) =>
        rpc(tx, "assign_project_member", { p_project_id: project, p_user_id: sm3.id, p_member_role: "site_manager" }),
      ),
    ).rejects.toThrow(appError("VALIDATION"));
    const profile = await t.one<{ status: string; deactivated_at: Date | null }>(
      "select status, deactivated_at from public.profiles where id = $1",
      [sm3.id],
    );
    expect(profile.status).toBe("inactive");
    expect(profile.deactivated_at).not.toBeNull();
    const audit = await t.one<{ action: string; summary: string }>(
      "select action, summary from public.audit_logs where entity_type = 'profiles' and entity_id = $1 and action = 'deactivate'",
      [sm3.id],
    );
    expect(audit.summary).toBe("Owner Kishore deactivated Site Manager Manoj");

    await t.asUser(w.owner.id, (tx) => rpc(tx, "set_user_status", { p_user_id: sm3.id, p_status: "active" }));
    const reactivated = await t.one<{ deactivated_at: Date | null }>(
      "select deactivated_at from public.profiles where id = $1",
      [sm3.id],
    );
    expect(reactivated.deactivated_at).toBeNull();
    await expect(
      t.asUser(w.sm1.id, (tx) => rpc(tx, "set_user_status", { p_user_id: sm3.id, p_status: "inactive" })),
    ).rejects.toThrow(appError("NOT_AUTHORIZED"));
  });
});

describe("notifications", () => {
  it("generates deadline notifications once (dedupe) and only for owners or the scheduler", async () => {
    const client = await t.createClient("Fernandes", { email: "fernandes@example.in" });
    const dueSoon = await t.createProject(client, { name: "Fernandes Penthouse", deadlineOffset: 7 });
    const overdue = await t.createProject(client, { name: "Fernandes Studio", deadlineOffset: -3 });
    const later = await t.createProject(client, { name: "Fernandes Farmhouse", deadlineOffset: 9 });
    for (const p of [dueSoon, overdue, later]) await t.addMember(p, w.sm2.id, "site_manager");

    await expect(t.asUser(w.sm1.id, (tx) => rpc(tx, "generate_deadline_notifications"))).rejects.toThrow(
      appError("NOT_AUTHORIZED"),
    );

    const created = await t.asUser(w.owner.id, (tx) => rpcScalar<number>(tx, "generate_deadline_notifications"));
    expect(created).toBeGreaterThan(0);
    const deadlineTypes = async (userId: string, projectId: string) =>
      (await notificationTypes(userId, projectId)).filter((type) => type !== "project_assigned");
    expect(await deadlineTypes(w.sm2.id, dueSoon)).toEqual(["project_deadline"]);
    expect(await deadlineTypes(w.owner.id, dueSoon)).toEqual(["project_deadline"]);
    expect(await deadlineTypes(w.sm2.id, overdue)).toEqual(["project_overdue"]);
    expect(await deadlineTypes(w.sm2.id, later)).toEqual([]);
    expect(await notificationTypes(w.sm2.id, later)).toEqual(["project_assigned"]);

    // Scheduler context (no JWT) is allowed and deduplicated.
    const again = await t.one<{ n: number }>("select public.generate_deadline_notifications() as n");
    expect(again.n).toBe(0);
  });

  it("notifies requester and admins about requests required within two days", async () => {
    const requestId = await createRequest(
      t,
      w.sm2.id,
      w.projectB,
      [{ material_name: "PVC Pipe", quantity: 60, unit: "Metres", estimated_unit_cost: 95 }],
      { requiredOffset: 1 },
    );
    await t.one("select public.generate_deadline_notifications() as n");
    expect(await notificationTypes(w.sm2.id, requestId)).toEqual(["request_due"]);
    expect(await notificationTypes(w.admin1.id, requestId)).toEqual(["material_request_new", "request_due"]);
    expect(await notificationTypes(w.admin2.id, requestId)).toEqual(["material_request_new", "request_due"]);
  });

  it("mark_all_notifications_read only touches the caller's notifications", async () => {
    await t.asUser(w.sm2.id, (tx) => rpc(tx, "mark_all_notifications_read"));
    expect(await count(t.db, "public.notifications", "user_id = $1 and read_at is null", [w.sm2.id])).toBe(0);
    expect(await count(t.db, "public.notifications", "user_id = $1 and read_at is null", [w.admin1.id])).toBeGreaterThan(0);
  });
});

describe("data integrity", () => {
  it("enforces unique project codes, client emails and date/progress checks", async () => {
    const code = await t.one<{ project_code: string }>("select project_code from public.projects where id = $1", [
      w.projectA,
    ]);
    await expect(
      t.asUser(w.owner.id, (tx) =>
        tx.query("insert into public.projects (client_id, name, project_code) values ($1, 'Copy', $2)", [
          w.clientA,
          code.project_code,
        ]),
      ),
    ).rejects.toThrow(/duplicate key/);
    await expect(
      t.asUser(w.owner.id, (tx) => tx.query("insert into public.clients (name, email) values ('Dup', 'KUMAR@example.in')")),
    ).rejects.toThrow(/duplicate key/);
    await expect(
      t.asUser(w.owner.id, (tx) =>
        tx.query(
          "insert into public.projects (client_id, name, start_date, expected_completion_date) values ($1, 'Bad dates', '2026-10-10', '2026-10-01')",
          [w.clientA],
        ),
      ),
    ).rejects.toThrow(/projects_expected_after_start_chk/);
    await expect(
      t.asUser(w.owner.id, (tx) =>
        tx.query("update public.projects set progress_percentage = 120 where id = $1", [w.projectA]),
      ),
    ).rejects.toThrow(/check constraint/);
    await expect(
      t.asUser(w.owner.id, (tx) => tx.query("insert into public.clients (name, email) values ('Bad', 'not-an-email')")),
    ).rejects.toThrow(/check constraint/);

    // Archiving a client frees its email for a new client record.
    const archived = await t.createClient("Reused Email", { email: "reuse@example.in" });
    await t.asUser(w.owner.id, (tx) => tx.query("update public.clients set archived_at = now() where id = $1", [archived]));
    await t.asUser(w.owner.id, (tx) =>
      tx.query("insert into public.clients (name, email) values ('Reused Email 2', 'reuse@example.in')"),
    );
  });

  it("owner can create clients and projects through RLS with generated codes", async () => {
    const created = await t.asUser(w.owner.id, async (tx) => {
      const client = await tx.query<{ id: string; client_code: string; created_by: string }>(
        "insert into public.clients (name, email, city) values ('Priya Apartment', 'priya.apartment@example.in', 'Chennai') returning id, client_code, created_by",
      );
      const clientRow = client.rows[0];
      if (!clientRow) throw new Error("no client");
      const project = await tx.query<{ project_code: string }>(
        "insert into public.projects (client_id, name) values ($1, 'Priya Apartment Interiors') returning project_code",
        [clientRow.id],
      );
      return { client: clientRow, project: project.rows[0] };
    });
    expect(created.client.client_code).toMatch(/^CL-\d{4}$/);
    expect(created.client.created_by).toBe(w.owner.id);
    expect(created.project?.project_code).toMatch(/^P-1\d{3}$/);
  });
});
