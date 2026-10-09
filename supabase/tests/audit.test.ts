import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { count, rpc, TestDatabase } from "./harness";
import { buildWorld, createRequest, type World } from "./fixtures";

let t: TestDatabase;
let w: World;

beforeAll(async () => {
  t = await TestDatabase.create();
  w = await buildWorld(t);
});

afterAll(async () => {
  await t?.close();
});

interface AuditRow {
  user_id: string | null;
  actor_name: string | null;
  role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  project_id: string | null;
  summary: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
}

const latestAudit = (entityType: string, entityId: string): Promise<AuditRow> =>
  t.one<AuditRow>(
    `select user_id, actor_name, role, action, entity_type, entity_id, project_id, summary, old_data, new_data, metadata
     from public.audit_logs where entity_type = $1 and entity_id = $2
     order by created_at desc, id desc limit 1`,
    [entityType, entityId],
  );

const projectCode = async (projectId: string): Promise<string> =>
  (await t.one<{ c: string }>("select project_code as c from public.projects where id = $1", [projectId])).c;

describe("human readable audit summaries", () => {
  it("records site manager progress updates", async () => {
    const updateId = await t.asUser(w.sm1.id, async (tx) => {
      const rows = await rpc<{ submit_project_update: string }>(tx, "submit_project_update", {
        p_project_id: w.projectA,
        p_status: "execution",
        p_progress: 72,
        p_update_date: null,
        p_milestone: null,
        p_expected_completion_date: null,
        p_issues: null,
        p_notes: "False ceiling completed in living room.",
        p_next_action: null,
      });
      return rows[0]?.submit_project_update ?? "";
    });
    const audit = await latestAudit("project_updates", updateId);
    expect(audit).toMatchObject({
      user_id: w.sm1.id,
      actor_name: "Ravi",
      role: "site_manager",
      action: "progress_update",
      project_id: w.projectA,
      summary: "Site Manager Ravi updated progress of Kumar Residence from 60% to 72%",
    });
  });

  it("records material request status changes", async () => {
    await t.asUser(w.admin1.id, (tx) =>
      rpc(tx, "update_material_request_status", { p_request_id: w.requestA2, p_status: "approved" }),
    );
    await t.asUser(w.admin1.id, (tx) =>
      rpc(tx, "update_material_request_status", { p_request_id: w.requestA2, p_status: "ordered" }),
    );
    const code = (await t.one<{ c: string }>("select request_code as c from public.material_requests where id = $1", [
      w.requestA2,
    ])).c;
    const audit = await latestAudit("material_requests", w.requestA2);
    expect(audit.action).toBe("status_change");
    expect(audit.summary).toBe(`${code} status changed from Approved to Ordered by Admin Priya`);
    expect(audit.old_data).toMatchObject({ status: "approved" });
    expect(audit.new_data).toMatchObject({ status: "ordered" });
    expect(audit.project_id).toBe(w.projectA);
    expect(audit.metadata).toMatchObject({ request_id: w.requestA2, request_code: code });
  });

  it("records project assignments with employee IDs", async () => {
    const membership = await t.one<{ id: string }>(
      "select id from public.project_members where project_id = $1 and user_id = $2",
      [w.projectA, w.sm1.id],
    );
    const audit = await latestAudit("project_members", membership.id);
    expect(audit.summary).toBe(`Owner Kishore assigned Kumar Residence (${await projectCode(w.projectA)}) to Ravi (SM-04)`);
    expect(audit.action).toBe("assign");
  });

  it("records project cost changes in rupees with Indian grouping", async () => {
    await t.asUser(w.owner.id, (tx) =>
      tx.query("update public.project_financials set project_cost = 420000 where project_id = $1", [w.projectA]),
    );
    const audit = await latestAudit("project_financials", w.projectA);
    expect(audit.summary).toBe(`Project cost of ${await projectCode(w.projectA)} changed from ₹4,00,000 to ₹4,20,000`);
    expect(audit.old_data).toEqual({ project_cost: 400000 });
    expect(audit.new_data).toEqual({ project_cost: 420000 });
    expect(audit.user_id).toBe(w.owner.id);
  });

  it("formats rupee amounts correctly", async () => {
    const rows = await t.sql<{ v: string }>(
      `select public.format_inr(x) as v from unnest(array[0, 999, 1000, 420000, 12345678.5, -1500, 100000000.25]::numeric[]) as x`,
    );
    expect(rows.map((r) => r.v)).toEqual(["₹0", "₹999", "₹1,000", "₹4,20,000", "₹1,23,45,678.50", "-₹1,500", "₹10,00,00,000.25"]);
  });
});

describe("audit trail mechanics", () => {
  it("skips no-op updates and updated_at-only touches", async () => {
    const before = await count(t.db, "public.audit_logs", "entity_type = 'clients' and entity_id = $1", [w.clientA]);
    await t.asUser(w.owner.id, (tx) =>
      tx.query("update public.clients set name = name, email = email where id = $1", [w.clientA]),
    );
    await t.sql("update public.clients set updated_at = now() - interval '1 day' where id = $1", [w.clientA]);
    const after = await count(t.db, "public.audit_logs", "entity_type = 'clients' and entity_id = $1", [w.clientA]);
    expect(after).toBe(before);

    await t.asUser(w.owner.id, (tx) =>
      tx.query("update public.clients set city = 'Mysuru', notes = 'Prefers weekend visits' where id = $1", [w.clientA]),
    );
    const audit = await latestAudit("clients", w.clientA);
    expect(audit.summary).toBe("Owner Kishore updated client Mr. Kumar (CL-0001): city, notes");
    expect(Object.keys(audit.new_data ?? {}).sort()).toEqual(["city", "notes"]);
  });

  it("logs a request creation once (items are folded into the request)", async () => {
    const requestId = await createRequest(t, w.sm1.id, w.projectA, [
      { material_name: "Sand", quantity: 200, unit: "Cu Ft", estimated_unit_cost: 60 },
      { material_name: "Modular Switch", quantity: 30, unit: "Units", estimated_unit_cost: 180 },
    ]);
    const rows = await t.sql<{ entity_type: string }>(
      "select entity_type from public.audit_logs where metadata ->> 'request_id' = $1",
      [requestId],
    );
    expect(rows.map((r) => r.entity_type)).toEqual(["material_requests"]);

    // Later item cost changes are audited against the request's project.
    const item = await t.one<{ id: string }>(
      "select id from public.material_request_items where request_id = $1 and material_name = 'Sand'",
      [requestId],
    );
    await t.asUser(w.owner.id, (tx) =>
      rpc(tx, "update_material_request_costs", {
        p_request_id: requestId,
        p_items: [{ item_id: item.id, estimated_unit_cost: 65 }],
      }),
    );
    const itemAudit = await latestAudit("material_request_items", item.id);
    expect(itemAudit.project_id).toBe(w.projectA);
    expect(itemAudit.action).toBe("cost_update");
    expect(itemAudit.summary).toMatch(/^Owner Kishore updated costs of Sand on MR-\d+$/);
    expect(await count(t.db, "public.audit_logs", "entity_type = 'material_requests' and entity_id = $1", [requestId])).toBe(1);
  });

  it("does not log default milestones and financial rows created with a project", async () => {
    const project = await t.createProject(w.clientA, { name: "Kumar Guest House" });
    const rows = await t.sql<{ entity_type: string }>(
      "select entity_type from public.audit_logs where project_id = $1",
      [project],
    );
    expect(rows.map((r) => r.entity_type)).toEqual(["projects"]);
  });

  it("keeps the actor name snapshot after the profile is renamed", async () => {
    await t.asUser(w.owner.id, (tx) =>
      tx.query("update public.profiles set full_name = 'Ravi Kumar' where id = $1", [w.sm1.id]),
    );
    const old = await t.sql<{ actor_name: string }>(
      "select distinct actor_name from public.audit_logs where user_id = $1 and entity_type = 'project_updates'",
      [w.sm1.id],
    );
    expect(old.map((r) => r.actor_name)).toEqual(["Ravi"]);
    const rename = await latestAudit("profiles", w.sm1.id);
    expect(rename.summary).toBe("Owner Kishore updated profile of Ravi Kumar: full name");
  });
});

describe("activity feed visibility", () => {
  it("site managers see their project's activity but never financials or other projects", async () => {
    const rows = await t.asUser(w.sm1.id, (tx) =>
      tx.query<{ entity_type: string; project_id: string | null; user_id: string | null }>(
        "select entity_type, project_id, user_id from public.activity_feed",
      ),
    );
    expect(rows.rows.length).toBeGreaterThan(0);
    for (const row of rows.rows) {
      expect(row.entity_type).not.toBe("project_financials");
      if (row.user_id !== w.sm1.id) {
        expect(row.project_id).toBe(w.projectA);
        expect(["profiles", "clients"]).not.toContain(row.entity_type);
      }
    }
    expect(rows.rows.some((r) => r.project_id === w.projectB)).toBe(false);
  });

  it("admins see activity of requests they can access only", async () => {
    const rows = await t.asUser(w.admin2.id, (tx) =>
      tx.query<{ entity_type: string; metadata: Record<string, unknown>; user_id: string | null }>(
        "select entity_type, metadata, user_id from public.activity_feed",
      ),
    );
    const requestIds = new Set(
      rows.rows.map((r) => r.metadata.request_id).filter((id): id is string => typeof id === "string"),
    );
    expect(requestIds.has(w.requestB1)).toBe(true);
    expect(requestIds.has(w.requestA2)).toBe(false);
    for (const row of rows.rows) {
      if (row.user_id !== w.admin2.id) {
        expect(["material_requests", "material_request_items", "material_deliveries", "material_request_comments"]).toContain(
          row.entity_type,
        );
      }
    }
  });

  it("the owner sees the full trail including financials", async () => {
    const total = await count(t.db, "public.audit_logs");
    expect(await t.asUser(w.owner.id, (tx) => count(tx, "public.activity_feed"))).toBe(total);
    expect(
      await t.asUser(w.owner.id, (tx) => count(tx, "public.activity_feed", "entity_type = 'project_financials'")),
    ).toBeGreaterThan(0);
  });
});
