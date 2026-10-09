import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { count, num, rpc, rpcScalar, TestDatabase } from "./harness";
import { appError, assignRequest, buildWorld, createRequest, type World } from "./fixtures";

/**
 * Regression tests for the review findings fixed in the migrations
 * (cost privacy, admin queue scope, notifications, delivery dates, variance,
 * metrics, milestones, documents, profile hardening, search links).
 */
let t: TestDatabase;
let w: World;

beforeAll(async () => {
  t = await TestDatabase.create();
  w = await buildWorld(t);
});

afterAll(async () => {
  await t?.close();
});

const fmt = async (offset: number): Promise<string> =>
  (await t.one<{ d: string }>("select to_char(public.app_today() + $1::int, 'DD Mon YYYY') as d", [offset])).d;

const codeOf = async (requestId: string): Promise<string> =>
  (await t.one<{ c: string }>("select request_code as c from public.material_requests where id = $1", [requestId])).c;

const itemsOf = (requestId: string) =>
  t.sql<{ id: string; material_name: string; quantity: string; approved_unit_cost: string | null; actual_unit_cost: string | null }>(
    `select id, material_name, quantity, approved_unit_cost, actual_unit_cost
     from public.material_request_items where request_id = $1 order by created_at, id`,
    [requestId],
  );

const newProjectFor = async (smId: string, opts: Parameters<TestDatabase["createProject"]>[1] = {}): Promise<string> => {
  const project = await t.createProject(w.clientA, opts);
  await t.addMember(project, smId, "site_manager");
  return project;
};

/** Requested -> approved -> ordered by admin1 (auto-assigned), expected delivery in 5 days. */
async function orderedRequest(material: string): Promise<string> {
  const id = await createRequest(t, w.sm1.id, w.projectA, [
    { material_name: material, quantity: 10, unit: "Units", estimated_unit_cost: 100 },
  ]);
  await t.asUser(w.admin1.id, (tx) => rpc(tx, "update_material_request_status", { p_request_id: id, p_status: "approved" }));
  // Resolve outer-connection queries before opening a transaction: PGlite has a
  // single connection, so querying `t` inside asUser() deadlocks.
  const expected = await t.dateOffset(5);
  await t.asUser(w.admin1.id, (tx) =>
    rpc(tx, "update_material_request_status", {
      p_request_id: id,
      p_status: "ordered",
      p_expected_delivery_date: expected,
    }),
  );
  return id;
}

describe("update_material_request_delivery_date", () => {
  it("moves the date, audits it, notifies the requester and keeps the note as a comment", async () => {
    const id = await orderedRequest("Delivery Date Board");
    const code = await codeOf(id);
    const newDate = await t.dateOffset(9);

    await t.asUser(w.admin1.id, (tx) =>
      rpc(tx, "update_material_request_delivery_date", {
        p_request_id: id,
        p_expected_delivery_date: newDate,
        p_note: "  Supplier delayed dispatch  ",
      }),
    );

    const row = await t.one<{ d: string }>("select expected_delivery_date::text as d from public.material_requests where id = $1", [id]);
    expect(row.d).toBe(newDate);

    const notes = await t.sql<{ title: string; type: string; message: string }>(
      "select title, type, message from public.notifications where user_id = $1 and entity_id = $2 and type = 'material_request_delivery_date'",
      [w.sm1.id, id],
    );
    expect(notes).toHaveLength(1);
    expect(notes[0]?.title).toBe(`Expected delivery for ${code} moved to ${await fmt(9)}`);
    expect(notes[0]?.message).toContain(`was ${await fmt(5)}`);

    const comments = await t.sql<{ body: string; author_id: string }>(
      "select body, author_id from public.material_request_comments where request_id = $1",
      [id],
    );
    expect(comments).toEqual([{ body: `Expected delivery ${await fmt(9)}: Supplier delayed dispatch`, author_id: w.admin1.id }]);

    const audit = await t.one<{ action: string; summary: string }>(
      `select action, summary from public.audit_logs
       where entity_type = 'material_requests' and entity_id = $1 order by created_at desc, id desc limit 1`,
      [id],
    );
    expect(audit).toEqual({
      action: "delivery_date_change",
      summary: `Admin Priya changed the expected delivery of ${code} from ${await fmt(5)} to ${await fmt(9)}`,
    });
    const commentAudit = await t.one<{ action: string; summary: string; project_id: string; metadata: Record<string, unknown> }>(
      "select action, summary, project_id, metadata from public.audit_logs where entity_type = 'material_request_comments' and metadata ->> 'request_id' = $1",
      [id],
    );
    expect(commentAudit).toMatchObject({ action: "comment", summary: `Admin Priya added a note on ${code}`, project_id: w.projectA });
    expect(commentAudit.metadata).toMatchObject({ request_id: id, request_code: code });

    // The owner can change it too; an empty note adds no comment.
    const ownerDate = await t.dateOffset(12);
    await t.asUser(w.owner.id, (tx) =>
      rpc(tx, "update_material_request_delivery_date", { p_request_id: id, p_expected_delivery_date: ownerDate, p_note: "  " }),
    );
    expect(await count(t.db, "public.material_request_comments", "request_id = $1", [id])).toBe(1);
  });

  it("enforces role, access, status and date rules", async () => {
    const id = await orderedRequest("Delivery Rules Board");
    const later = await t.dateOffset(7);
    await expect(
      t.asUser(w.sm1.id, (tx) => rpc(tx, "update_material_request_delivery_date", { p_request_id: id, p_expected_delivery_date: later })),
    ).rejects.toThrow(appError("NOT_AUTHORIZED"));
    await expect(
      t.asUser(w.admin2.id, (tx) => rpc(tx, "update_material_request_delivery_date", { p_request_id: id, p_expected_delivery_date: later })),
    ).rejects.toThrow(appError("NOT_AUTHORIZED"));
    const yesterday = await t.dateOffset(-1);
    await expect(
      t.asUser(w.admin1.id, (tx) =>
        rpc(tx, "update_material_request_delivery_date", { p_request_id: id, p_expected_delivery_date: yesterday }),
      ),
    ).rejects.toThrow(appError("VALIDATION"));
    await expect(
      t.asUser(w.admin1.id, (tx) => rpc(tx, "update_material_request_delivery_date", { p_request_id: id, p_expected_delivery_date: null })),
    ).rejects.toThrow(appError("VALIDATION"));
    await expect(
      t.asUser(w.admin1.id, (tx) =>
        rpc(tx, "update_material_request_delivery_date", { p_request_id: id, p_expected_delivery_date: later, p_note: "x".repeat(2001) }),
      ),
    ).rejects.toThrow(appError("VALIDATION"));

    const pending = await createRequest(t, w.sm1.id, w.projectA, [{ material_name: "Delivery Pending Board", quantity: 1, unit: "Units" }]);
    await expect(
      t.asUser(w.owner.id, (tx) => rpc(tx, "update_material_request_delivery_date", { p_request_id: pending, p_expected_delivery_date: later })),
    ).rejects.toThrow(appError("INVALID_TRANSITION"));

    const rows = await t.sql<{ auth: boolean; anon: boolean }>(
      `select has_function_privilege('authenticated', 'public.update_material_request_delivery_date(uuid, date, text)', 'execute') as auth,
              has_function_privilege('anon', 'public.update_material_request_delivery_date(uuid, date, text)', 'execute') as anon`,
    );
    expect(rows[0]).toEqual({ auth: true, anon: false });
  });

  it("publishes comments and deliveries for realtime", async () => {
    const rows = await t.sql<{ tablename: string }>(
      "select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' order by tablename",
    );
    expect(rows.map((r) => r.tablename)).toEqual([
      "material_deliveries",
      "material_request_comments",
      "material_requests",
      "notifications",
      "project_updates",
      "projects",
    ]);
  });
});

describe("material cost privacy (site managers see estimates only)", () => {
  let requestId: string;
  let itemId: string;

  beforeAll(async () => {
    requestId = await createRequest(t, w.sm1.id, w.projectA, [
      { material_name: "Privacy Tiles", quantity: 10, unit: "Sq Ft", estimated_unit_cost: 50 },
    ]);
    await assignRequest(t, w.owner.id, requestId, w.admin1.id);
    itemId = (await itemsOf(requestId))[0]?.id ?? "";
    await t.asUser(w.admin1.id, (tx) =>
      rpc(tx, "update_material_request_costs", {
        p_request_id: requestId,
        p_items: [{ item_id: itemId, approved_unit_cost: 45, actual_unit_cost: 60 }],
      }),
    );
  });

  it("blocks approved/actual columns on the base tables but keeps estimates readable", async () => {
    await expect(
      t.asUser(w.sm1.id, (tx) => tx.query("select approved_cost from public.material_requests where id = $1", [requestId])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      t.asUser(w.sm1.id, (tx) => tx.query("select * from public.material_request_items where request_id = $1", [requestId])),
    ).rejects.toThrow(/permission denied/);
    const est = await t.asUser(w.sm1.id, (tx) =>
      tx.query<{ estimated_cost: string; estimated_unit_cost: string }>(
        `select r.estimated_cost, i.estimated_unit_cost from public.material_requests r
         join public.material_request_items i on i.request_id = r.id where r.id = $1`,
        [requestId],
      ),
    );
    expect(num(est.rows[0]?.estimated_cost)).toBe(500);
    expect(num(est.rows[0]?.estimated_unit_cost)).toBe(50);
  });

  it("masks costs in the read models for site managers only", async () => {
    const asSm = await t.asUser(w.sm1.id, (tx) =>
      tx.query<Record<string, unknown>>("select * from public.material_request_item_directory where request_id = $1", [requestId]),
    );
    expect(asSm.rows[0]).toMatchObject({ approved_unit_cost: null, actual_unit_cost: null });
    expect(num(asSm.rows[0]?.estimated_unit_cost)).toBe(50);

    const asAdmin = await t.asUser(w.admin1.id, (tx) =>
      tx.query<Record<string, unknown>>("select * from public.material_request_item_directory where request_id = $1", [requestId]),
    );
    expect(num(asAdmin.rows[0]?.approved_unit_cost)).toBe(45);
    expect(num(asAdmin.rows[0]?.actual_unit_cost)).toBe(60);
    // Same columns, same order as the base table.
    const viewCols = await t.sql<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'material_request_item_directory' order by ordinal_position",
    );
    const tableCols = await t.sql<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'material_request_items' order by ordinal_position",
    );
    expect(viewCols.map((c) => c.column_name)).toEqual(tableCols.map((c) => c.column_name));

    const dirSm = await t.asUser(w.sm1.id, (tx) =>
      tx.query<Record<string, unknown>>(
        "select estimated_cost, approved_cost, actual_cost, cost_variance from public.material_request_directory where id = $1",
        [requestId],
      ),
    );
    expect(dirSm.rows[0]).toMatchObject({ approved_cost: null, actual_cost: null, cost_variance: null });
    expect(num(dirSm.rows[0]?.estimated_cost)).toBe(500);
    const dirOwner = await t.asUser(w.owner.id, (tx) =>
      tx.query<Record<string, unknown>>(
        "select approved_cost, actual_cost, cost_variance from public.material_request_directory where id = $1",
        [requestId],
      ),
    );
    expect(num(dirOwner.rows[0]?.approved_cost)).toBe(450);
    expect(num(dirOwner.rows[0]?.actual_cost)).toBe(600);
    expect(num(dirOwner.rows[0]?.cost_variance)).toBe(100);

    const sumSm = await t.asUser(w.sm1.id, (tx) =>
      tx.query<Record<string, unknown>>(
        "select pending_material_cost, approved_material_cost, actual_material_cost from public.project_material_summary where project_id = $1",
        [w.projectA],
      ),
    );
    expect(sumSm.rows[0]).toMatchObject({ approved_material_cost: null, actual_material_cost: null });
    expect(num(sumSm.rows[0]?.pending_material_cost)).toBeGreaterThan(0);
  });

  it("hides cost-bearing audit rows from site managers unless the owner granted financial access", async () => {
    const where = "entity_type = 'material_request_items' and action = 'cost_update' and entity_id = $1";
    expect(await t.asUser(w.sm1.id, (tx) => count(tx, "public.audit_logs", where, [itemId]))).toBe(0);
    expect(await t.asUser(w.sm1.id, (tx) => count(tx, "public.activity_feed", where, [itemId]))).toBe(0);
    expect(await t.asUser(w.admin1.id, (tx) => count(tx, "public.audit_logs", where, [itemId]))).toBe(1);
    // Non-cost rows of the same request stay visible to the site manager.
    expect(
      await t.asUser(w.sm1.id, (tx) => count(tx, "public.audit_logs", "entity_type = 'material_requests' and entity_id = $1", [requestId])),
    ).toBeGreaterThan(0);

    await t.asUser(w.owner.id, (tx) =>
      rpcScalar(tx, "assign_project_member", {
        p_project_id: w.projectA,
        p_user_id: w.sm1.id,
        p_member_role: "site_manager",
        p_can_view_financials: true,
      }),
    );
    expect(await t.asUser(w.sm1.id, (tx) => count(tx, "public.audit_logs", where, [itemId]))).toBe(1);
    const granted = await t.asUser(w.sm1.id, (tx) =>
      tx.query<{ actual_unit_cost: string }>("select actual_unit_cost from public.material_request_item_directory where id = $1", [itemId]),
    );
    expect(num(granted.rows[0]?.actual_unit_cost)).toBe(60);
    await t.asUser(w.owner.id, (tx) =>
      rpcScalar(tx, "assign_project_member", {
        p_project_id: w.projectA,
        p_user_id: w.sm1.id,
        p_member_role: "site_manager",
        p_can_view_financials: false,
      }),
    );
    expect(await t.asUser(w.sm1.id, (tx) => count(tx, "public.audit_logs", where, [itemId]))).toBe(0);
  });
});

describe("admin queue scope", () => {
  it("closed unassigned requests leave the shared admin queue, and so does their project", async () => {
    const client = await t.createClient("Queue Client", { email: "queue@example.in" });
    const project = await t.createProject(client, { name: "Queue Flat" });
    await t.addMember(project, w.sm2.id, "site_manager");
    const id = await createRequest(t, w.sm2.id, project, [{ material_name: "Queue Sand", quantity: 5, unit: "Cu Ft" }]);

    expect(await t.asUser(w.admin1.id, (tx) => count(tx, "public.material_requests", "id = $1", [id]))).toBe(1);
    expect(await t.asUser(w.admin1.id, (tx) => count(tx, "public.project_directory", "id = $1", [project]))).toBe(1);

    await t.asUser(w.owner.id, (tx) =>
      rpc(tx, "update_material_request_status", { p_request_id: id, p_status: "rejected", p_note: "Not needed" }),
    );
    for (const admin of [w.admin1, w.admin2]) {
      await t.asUser(admin.id, async (tx) => {
        expect(await count(tx, "public.material_requests", "id = $1", [id])).toBe(0);
        expect(await count(tx, "public.material_request_directory", "id = $1", [id])).toBe(0);
        expect(await count(tx, "public.projects", "id = $1", [project])).toBe(0);
        expect(await count(tx, "public.project_milestones", "project_id = $1", [project])).toBe(0);
      });
    }
    // The owner and the site manager still see it.
    expect(await t.asUser(w.sm2.id, (tx) => count(tx, "public.material_requests", "id = $1", [id]))).toBe(1);
  });
});

describe("notifications follow access", () => {
  it("a requester moved off the project stops receiving request notifications", async () => {
    const project = await newProjectFor(w.sm1.id, { name: "Moved Off Flat" });
    const id = await createRequest(t, w.sm1.id, project, [{ material_name: "Moved Off Putty", quantity: 3, unit: "Kg" }], {
      requiredOffset: 1,
    });
    await t.asUser(w.owner.id, (tx) => rpc(tx, "remove_project_member", { p_project_id: project, p_user_id: w.sm1.id }));

    await t.asUser(w.admin1.id, (tx) => rpc(tx, "add_material_request_comment", { p_request_id: id, p_body: "Is this still needed?" }));
    await t.asUser(w.admin1.id, (tx) => rpc(tx, "update_material_request_status", { p_request_id: id, p_status: "pending_review" }));
    await t.one("select public.generate_deadline_notifications() as n");

    expect(await count(t.db, "public.notifications", "user_id = $1 and entity_id = $2", [w.sm1.id, id])).toBe(0);
    // The admin who still has access is notified about the deadline.
    expect(await count(t.db, "public.notifications", "user_id = $1 and entity_id = $2 and type = 'request_due'", [w.admin1.id, id])).toBe(1);
  });
});

describe("profile and account hardening", () => {
  it("only an active owner may start a self-service email change", async () => {
    await expect(
      t.sql("update auth.users set email_change = 'ravi.new@example.in' where id = $1", [w.sm1.id]),
    ).rejects.toThrow(appError("NOT_AUTHORIZED"));
    await t.sql("update auth.users set email_change = 'owner.new@example.in' where id = $1", [w.owner.id]);
    await t.sql("update auth.users set email_change = '' where id = $1", [w.owner.id]);
    // Admin API style change (email set directly) still syncs the profile.
    await t.sql("update auth.users set email = 'Suresh.Renamed@Example.in' where id = $1", [w.sm2.id]);
    const profile = await t.one<{ email: string }>("select email from public.profiles where id = $1", [w.sm2.id]);
    expect(profile.email).toBe("suresh.renamed@example.in");
  });

  it("avatar_url is owner-managed and https-only", async () => {
    await expect(
      t.asUser(w.sm1.id, (tx) =>
        tx.query("update public.profiles set avatar_url = 'https://attacker.example/t.png' where id = $1", [w.sm1.id]),
      ),
    ).rejects.toThrow(appError("NOT_AUTHORIZED"));
    await expect(
      t.asUser(w.owner.id, (tx) =>
        tx.query("update public.profiles set avatar_url = 'javascript:alert(1)' where id = $1", [w.sm1.id]),
      ),
    ).rejects.toThrow(/check constraint/);
    await expect(
      t.asUser(w.owner.id, (tx) =>
        tx.query(`update public.profiles set avatar_url = 'https://x.example/a"onerror=1' where id = $1`, [w.sm1.id]),
      ),
    ).rejects.toThrow(/check constraint/);
    await t.asUser(w.owner.id, (tx) =>
      tx.query("update public.profiles set avatar_url = 'https://project.supabase.co/storage/v1/object/public/a.png' where id = $1", [w.sm1.id]),
    );
  });

  it("role-less sign-ups get an inactive profile with no access", async () => {
    const nobody = await t.createUser(null, "Public Signup");
    const row = await t.one<{ role: string | null; status: string }>("select role, status from public.profiles where id = $1", [nobody.id]);
    expect(row).toEqual({ role: null, status: "inactive" });
    await expect(t.asUser(nobody.id, (tx) => rpc(tx, "global_search", { p_query: "Kumar" }))).rejects.toThrow(appError("NOT_AUTHORIZED"));
    // promote_to_owner still activates a dashboard-created account.
    await t.sql("select public.promote_to_owner($1)", [nobody.email]);
    const promoted = await t.one<{ role: string; status: string }>("select role, status from public.profiles where id = $1", [nobody.id]);
    expect(promoted).toEqual({ role: "owner", status: "active" });
  });
});

describe("project documents", () => {
  const upload = (userId: string, path: string, metadata: Record<string, unknown> | null = null) =>
    t.asUser(userId, (tx) =>
      tx.query("insert into storage.objects (bucket_id, name, metadata) values ('project-documents', $1, $2)", [
        path,
        metadata === null ? null : JSON.stringify(metadata),
      ]),
    );
  const register = (userId: string, row: Record<string, unknown>) =>
    t.asUser(userId, (tx) =>
      tx.query<{ id: string }>(
        `insert into public.project_documents (project_id, category, file_name, storage_path, mime_type, size_bytes,
                                               uploaded_by, created_at, archived_at)
         values ($1, $2::public.document_category, $3, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz) returning id`,
        [
          row.project_id as string,
          row.category as string,
          (row.file_name as string) ?? "file.jpg",
          row.storage_path as string,
          (row.mime_type as string) ?? null,
          (row.size_bytes as number) ?? null,
          userId,
          (row.created_at as string) ?? null,
          (row.archived_at as string) ?? null,
        ],
      ),
    );

  it("takes metadata from the uploaded object and ignores forged dates", async () => {
    const path = `${w.projectA}/photos/aaaa-ceiling.jpg`;
    await upload(w.sm1.id, path, { size: 2048, mimetype: "image/jpeg" });
    const res = await register(w.sm1.id, {
      project_id: w.projectA,
      category: "photos",
      storage_path: path,
      mime_type: "text/html",
      size_bytes: 1,
      created_at: "2020-01-01T00:00:00Z",
      archived_at: "2020-01-02T00:00:00Z",
    });
    const doc = await t.one<{ mime_type: string; size_bytes: string; archived_at: Date | null; recent: boolean }>(
      "select mime_type, size_bytes, archived_at, created_at > now() - interval '1 hour' as recent from public.project_documents where id = $1",
      [res.rows[0]?.id ?? ""],
    );
    expect(doc).toMatchObject({ mime_type: "image/jpeg", archived_at: null, recent: true });
    expect(num(doc.size_bytes)).toBe(2048);
  });

  it("rejects unknown files, category mismatches and closed projects", async () => {
    await expect(
      register(w.sm1.id, { project_id: w.projectA, category: "photos", storage_path: `${w.projectA}/photos/ghost.jpg` }),
    ).rejects.toThrow(appError("VALIDATION"));

    const path = `${w.projectA}/photos/bbbb-plan.pdf`;
    await upload(w.sm1.id, path);
    await expect(
      register(w.sm1.id, { project_id: w.projectA, category: "drawings", storage_path: path }),
    ).rejects.toThrow(appError("VALIDATION"));

    const closed = await newProjectFor(w.sm1.id, { name: "Closed Docs", status: "completed", actualHandoverOffset: -1 });
    const closedPath = `${closed}/photos/cccc-final.jpg`;
    await upload(w.owner.id, closedPath);
    await expect(
      register(w.sm1.id, { project_id: closed, category: "photos", storage_path: closedPath }),
    ).rejects.toThrow(/row-level security/);
    await register(w.owner.id, { project_id: closed, category: "photos", storage_path: closedPath });
  });
});

describe("RPC text limits", () => {
  const base = async () => ({
    p_project_id: w.projectA,
    p_title: "Limits",
    p_required_date: await t.dateOffset(5),
    p_priority: "low",
    p_allow_duplicate: true,
  });

  it("rejects oversized notes, item notes and categories with VALIDATION", async () => {
    // Resolved before asUser(): querying `t` inside a transaction deadlocks PGlite.
    const b = await base();
    await expect(
      t.asUser(w.sm1.id, (tx) =>
        rpc(tx, "create_material_request", { ...b, p_notes: "n".repeat(2001), p_items: [{ material_name: "Limit A", quantity: 1, unit: "Kg" }] }),
      ),
    ).rejects.toThrow(appError("VALIDATION"));
    await expect(
      t.asUser(w.sm1.id, (tx) =>
        rpc(tx, "create_material_request", {
          ...b,
          p_notes: null,
          p_items: [{ material_name: "Limit B", quantity: 1, unit: "Kg", notes: "x".repeat(501) }],
        }),
      ),
    ).rejects.toThrow(appError("VALIDATION"));
    await expect(
      t.asUser(w.sm1.id, (tx) =>
        rpc(tx, "create_material_request", {
          ...b,
          p_notes: null,
          p_items: [{ material_name: "Limit C", quantity: 1, unit: "Kg", category: "c".repeat(81) }],
        }),
      ),
    ).rejects.toThrow(appError("VALIDATION"));
  });
});

describe("global search", () => {
  it("links catalog materials to the catalog tab with an encoded query", async () => {
    const rows = await t.asUser(w.owner.id, (tx) =>
      rpc<{ entity_type: string; href: string }>(tx, "global_search", { p_query: "Vitrified" }),
    );
    const material = rows.find((r) => r.entity_type === "material");
    expect(material?.href).toBe("/materials?tab=catalog&q=Vitrified%20Tiles");
    const encoded = await t.one<{ v: string }>("select public.url_encode('Plywood 18mm & Co #1/₹') as v");
    expect(encoded.v).toBe("Plywood%2018mm%20%26%20Co%20%231%2F%E2%82%B9");
  });
});

describe("progress updates advance the timeline", () => {
  it("completes earlier open milestones and starts the reported one", async () => {
    const project = await newProjectFor(w.sm1.id, { name: "Timeline Villa" });
    const approval = await t.one<{ id: string }>("select id from public.project_milestones where project_id = $1 and name = 'Approval'", [project]);
    await t.sql("update public.project_milestones set status = 'skipped' where id = $1", [approval.id]);

    await t.asUser(w.sm1.id, (tx) =>
      rpc(tx, "submit_project_update", {
        p_project_id: project,
        p_status: "execution",
        p_progress: 45,
        p_update_date: null,
        p_milestone: "execution",
        p_expected_completion_date: null,
        p_issues: null,
        p_notes: null,
        p_next_action: null,
      }),
    );
    const today = await t.today();
    const rows = await t.sql<{ name: string; status: string; start_date: string | null; completed_date: string | null }>(
      "select name, status, start_date::text, completed_date::text from public.project_milestones where project_id = $1 order by sort_order",
      [project],
    );
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect(byName["Design"]).toMatchObject({ status: "completed", completed_date: today });
    expect(byName["Approval"]).toMatchObject({ status: "skipped" });
    expect(byName["Procurement"]).toMatchObject({ status: "completed", completed_date: today });
    expect(byName["Execution"]).toMatchObject({ status: "in_progress", start_date: today, completed_date: null });
    expect(byName["Finishing"]).toMatchObject({ status: "not_started" });

    const audit = await t.sql<{ summary: string }>(
      "select summary from public.audit_logs where entity_type = 'project_milestones' and project_id = $1 order by summary",
      [project],
    );
    expect(audit.map((a) => a.summary)).toContain("Site Manager Ravi marked milestone Execution of Timeline Villa as In Progress");
  });
});

describe("cost variance compares like with like", () => {
  const overruns = (requestId: string) =>
    count(t.db, "public.notifications", "user_id = $1 and entity_id = $2 and type = 'cost_overrun'", [w.owner.id, requestId]);

  it("does not flag an item without an estimate as an overrun", async () => {
    const id = await createRequest(t, w.sm1.id, w.projectA, [
      { material_name: "Variance Board A", quantity: 10, unit: "Units", estimated_unit_cost: 100 },
      { material_name: "Variance Custom Handle", quantity: 5, unit: "Units" },
    ]);
    const [a, b] = await itemsOf(id);
    await t.asUser(w.owner.id, (tx) =>
      rpc(tx, "update_material_request_costs", {
        p_request_id: id,
        p_items: [
          { item_id: a?.id, actual_unit_cost: 100 },
          { item_id: b?.id, actual_unit_cost: 100 },
        ],
      }),
    );
    const row = await t.one<Record<string, string>>(
      "select estimated_cost, actual_cost, variance_estimated_cost, variance_actual_cost from public.material_requests where id = $1",
      [id],
    );
    expect([num(row.estimated_cost), num(row.actual_cost), num(row.variance_estimated_cost), num(row.variance_actual_cost)]).toEqual([
      1000, 1500, 1000, 1000,
    ]);
    expect(await overruns(id)).toBe(0);
  });

  it("flags a real overrun even while other items still await actual costs", async () => {
    const id = await createRequest(t, w.sm1.id, w.projectA, [
      { material_name: "Variance Board B", quantity: 10, unit: "Units", estimated_unit_cost: 100 },
      { material_name: "Variance Board C", quantity: 10, unit: "Units", estimated_unit_cost: 500 },
    ]);
    const [a] = await itemsOf(id);
    await t.asUser(w.owner.id, (tx) =>
      rpc(tx, "update_material_request_costs", { p_request_id: id, p_items: [{ item_id: a?.id, actual_unit_cost: 250 }] }),
    );
    expect(await overruns(id)).toBe(1);
    const message = await t.one<{ message: string }>(
      "select message from public.notifications where user_id = $1 and entity_id = $2 and type = 'cost_overrun'",
      [w.owner.id, id],
    );
    expect(message.message).toMatch(/^Actual cost ₹2,500 exceeds the estimate ₹1,000 by ₹1,500 /);

    const dashboard = await t.asUser(w.owner.id, (tx) => rpcScalar<Record<string, number>>(tx, "get_owner_dashboard"));
    const fin = await t.asUser(w.owner.id, (tx) =>
      tx.query<{ v: string }>("select sum(material_variance) as v from public.project_financial_summary"),
    );
    expect(dashboard.material_variance).toBe(num(fin.rows[0]?.v));
    expect(dashboard.material_variance).toBeGreaterThanOrEqual(1500);
  });
});

describe("draft edits keep admin-entered costs", () => {
  it("updates kept items in place and deletes only removed ones", async () => {
    const id = await createRequest(t, w.sm1.id, w.projectA, [
      { material_name: "Draft Tile", quantity: 10, unit: "Sq Ft", estimated_unit_cost: 50 },
      { material_name: "Draft Grout", quantity: 2, unit: "Bags", estimated_unit_cost: 300 },
    ]);
    const [tile] = await itemsOf(id);
    await t.asUser(w.owner.id, (tx) =>
      rpc(tx, "update_material_request_costs", {
        p_request_id: id,
        p_items: [{ item_id: tile?.id, approved_unit_cost: 45, actual_unit_cost: 48 }],
      }),
    );
    const draftRequiredDate = await t.dateOffset(10);
    const draft = async (items: unknown[]) =>
      t.asUser(w.sm1.id, (tx) =>
        rpc(tx, "update_material_request_draft", {
          p_request_id: id,
          p_title: "Draft edit",
          p_required_date: draftRequiredDate,
          p_priority: "medium",
          p_notes: null,
          p_items: items,
        }),
      );

    // No ids (current form): matched by material name + unit.
    await draft([
      { material_name: "draft tile", quantity: 12, unit: "Sq Ft", estimated_unit_cost: 50 },
      { material_name: "Draft Spacer", quantity: 100, unit: "Units", estimated_unit_cost: 1 },
    ]);
    let items = await itemsOf(id);
    expect(items.map((i) => i.material_name)).toEqual(["draft tile", "Draft Spacer"]);
    expect(items[0]?.id).toBe(tile?.id);
    expect(num(items[0]?.quantity)).toBe(12);
    expect(num(items[0]?.approved_unit_cost)).toBe(45);
    expect(num(items[0]?.actual_unit_cost)).toBe(48);

    // Explicit id: a renamed item keeps its identity and costs.
    await draft([{ id: tile?.id, material_name: "Draft Tile 2x2", quantity: 12, unit: "Sq Ft", estimated_unit_cost: 52 }]);
    items = await itemsOf(id);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: tile?.id, material_name: "Draft Tile 2x2" });
    expect(num(items[0]?.approved_unit_cost)).toBe(45);

    await expect(
      draft([{ id: "00000000-0000-4000-8000-000000000009", material_name: "Ghost", quantity: 1, unit: "Units" }]),
    ).rejects.toThrow(appError("VALIDATION"));
  });
});

describe("delivery dates", () => {
  it("never moves the delivery date backwards and rejects dates before the request", async () => {
    const id = await createRequest(t, w.sm1.id, w.projectA, [
      { material_name: "Backdate Cement", quantity: 30, unit: "Bags", estimated_unit_cost: 400 },
    ], { allowDuplicate: true });
    await t.sql("update public.material_requests set requested_at = now() - interval '20 days' where id = $1", [id]);
    await t.asUser(w.owner.id, (tx) => rpc(tx, "update_material_request_status", { p_request_id: id, p_status: "approved" }));
    const [item] = await itemsOf(id);
    const deliver = async (offset: number, qty: number) => {
      const deliveryOn = await t.dateOffset(offset);
      return t.asUser(w.owner.id, (tx) =>
        rpc(tx, "record_material_delivery", {
          p_request_id: id,
          p_delivery_date: deliveryOn,
          p_items: [{ item_id: item?.id, delivered_quantity: qty }],
        }),
      );
    };
    const deliveryDate = async () =>
      (await t.one<{ d: string }>("select delivery_date::text as d from public.material_requests where id = $1", [id])).d;

    await deliver(-2, 10);
    expect(await deliveryDate()).toBe(await t.dateOffset(-2));
    await deliver(-5, 10);
    expect(await deliveryDate()).toBe(await t.dateOffset(-2));
    await expect(deliver(-25, 5)).rejects.toThrow(appError("VALIDATION"));
    await expect(
      t.asUser(w.owner.id, (tx) => rpc(tx, "update_material_request_status", { p_request_id: id, p_status: "delivered" })),
    ).rejects.toThrow(appError("INVALID_TRANSITION"));
    await deliver(-1, 10);
    const row = await t.one<{ status: string; d: string }>("select status, delivery_date::text as d from public.material_requests where id = $1", [id]);
    expect(row).toEqual({ status: "delivered", d: await t.dateOffset(-1) });
    expect(await count(t.db, "public.material_deliveries", "request_id = $1", [id])).toBe(3);
  });
});

describe("performance and dashboard metrics", () => {
  it("site manager on-time rate uses completion stamps and the committed deadline; updates are counted", async () => {
    const sm = await t.createUser("site_manager", "Perf SM", { employeeId: "SM-77" });
    const late = await newProjectFor(sm.id, { name: "Perf Late", deadlineOffset: -5 });
    const noDeadline = await newProjectFor(sm.id, { name: "Perf No Deadline", deadlineOffset: null });
    const onTime = await newProjectFor(sm.id, { name: "Perf On Time", deadlineOffset: 20 });
    const update = (project: string, status: string, expected: string | null) =>
      t.asUser(sm.id, (tx) =>
        rpc(tx, "submit_project_update", {
          p_project_id: project,
          p_status: status,
          p_progress: status === "completed" ? 100 : 80,
          p_update_date: null,
          p_milestone: null,
          p_expected_completion_date: expected,
          p_issues: null,
          p_notes: null,
          p_next_action: null,
        }),
      );

    // The site manager extends the deadline: the forecast moves, the commitment does not.
    await update(late, "execution", await t.dateOffset(10));
    const dates = await t.one<{ e: string; c: string }>(
      "select expected_completion_date::text as e, committed_completion_date::text as c from public.projects where id = $1",
      [late],
    );
    expect(dates).toEqual({ e: await t.dateOffset(10), c: await t.dateOffset(-5) });
    await update(late, "completed", null);

    // Owner completes through a direct edit: the completion date is stamped.
    await t.asUser(w.owner.id, async (tx) => {
      await tx.query("update public.projects set status = 'completed' where id = $1", [noDeadline]);
      await tx.query("update public.projects set status = 'completed' where id = $1", [onTime]);
      // Reopen clears the date; completing again stamps it afresh.
      await tx.query("update public.projects set status = 'execution' where id = $1", [onTime]);
    });
    expect((await t.one<{ a: string | null }>("select actual_handover_date::text as a from public.projects where id = $1", [onTime])).a).toBeNull();
    await t.asUser(w.owner.id, (tx) => tx.query("update public.projects set status = 'completed' where id = $1", [onTime]));
    const stamped = await t.one<{ a: string }>("select actual_handover_date::text as a from public.projects where id = $1", [noDeadline]);
    expect(stamped.a).toBe(await t.today());

    // The owner moving the expected date moves the commitment.
    const ownerMoved = await newProjectFor(sm.id, { name: "Perf Owner Moved", deadlineOffset: 30 });
    const movedTo = await t.dateOffset(40);
    await t.asUser(w.owner.id, (tx) =>
      tx.query("update public.projects set expected_completion_date = $2 where id = $1", [ownerMoved, movedTo]),
    );
    const moved = await t.one<{ c: string }>("select committed_completion_date::text as c from public.projects where id = $1", [ownerMoved]);
    expect(moved.c).toBe(await t.dateOffset(40));

    const rows = await t.asUser(w.owner.id, (tx) => rpc<Record<string, unknown>>(tx, "get_site_manager_performance"));
    const row = rows.find((r) => r.user_id === sm.id);
    expect(row).toMatchObject({ completed_projects: 3, on_time_completed: 1, project_updates_count: 2 });
    expect(num(row?.on_time_rate)).toBe(50);
    // project_updates_count is the last column (existing callers keep working).
    const cols = await t.sql<{ name: string }>(
      `select unnest(proargnames) as name from pg_proc where proname = 'get_site_manager_performance'`,
    );
    expect(cols[cols.length - 1]?.name).toBe("project_updates_count");
  });

  it("admin completion rate ignores cancelled requests and response time starts at assignment", async () => {
    const admin = await t.createUser("admin", "Perf Admin", { employeeId: "AD-77" });
    const insert = (status: string, assignedAt: string | null, reviewedAfter: string, delivered: boolean) =>
      t.sql(
        `insert into public.material_requests (project_id, requested_by, assigned_admin, title, required_date, status,
                                               requested_at, assigned_at, reviewed_at, delivery_date, completed_at, cancelled_at)
         values ($1, $2, $3, 'Perf', public.app_today() + 5, $4::public.material_request_status,
                 now() - interval '10 days',
                 case when $5::text is null then null else now() - interval '10 days' + $5::interval end,
                 now() - interval '10 days' + $6::interval,
                 case when $7::boolean then ((now() - interval '10 days') at time zone 'Asia/Kolkata')::date + 3 end,
                 case when $7::boolean then now() end,
                 case when $4 = 'cancelled' then now() end)`,
        [w.projectA, w.sm1.id, admin.id, status, assignedAt, reviewedAfter, delivered],
      );
    await insert("delivered", "1 day", "1 day 4 hours", true);
    await insert("cancelled", null, "2 hours", false);

    const rows = await t.asUser(w.owner.id, (tx) => rpc<Record<string, unknown>>(tx, "get_admin_performance"));
    const row = rows.find((r) => r.user_id === admin.id);
    expect(row).toMatchObject({ requests_assigned: 2, completed: 1 });
    expect(num(row?.completion_rate)).toBe(100);
    expect(num(row?.avg_response_hours)).toBe(3);
    expect(num(row?.avg_completion_days)).toBe(3);
  });

  it("site manager 'overdue' KPI includes projects marked delayed, like its drill-down", async () => {
    const sm = await t.createUser("site_manager", "Dash SM", { employeeId: "SM-78" });
    await newProjectFor(sm.id, { name: "Dash Delayed", status: "delayed", deadlineOffset: 20 });
    await newProjectFor(sm.id, { name: "Dash Fine", status: "execution", deadlineOffset: 20 });
    const dash = await t.asUser(sm.id, (tx) => rpcScalar<Record<string, number>>(tx, "get_site_manager_dashboard"));
    expect(dash.overdue_projects).toBe(1);
  });
});

describe("generated codes", () => {
  it("skip codes that were entered manually", async () => {
    const seq = await t.one<{ v: string }>("select last_value::text as v from public.project_code_seq");
    const next = `P-${1000 + Number(seq.v) + 1}`;
    const codes = await t.asUser(w.owner.id, async (tx) => {
      await tx.query("insert into public.projects (client_id, name, project_code) values ($1, 'Manual Code', $2)", [w.clientA, next]);
      const r = await tx.query<{ project_code: string }>(
        "insert into public.projects (client_id, name) values ($1, 'Auto Code') returning project_code",
        [w.clientA],
      );
      return r.rows[0]?.project_code;
    });
    expect(codes).toBe(`P-${1000 + Number(seq.v) + 2}`);

    const cseq = await t.one<{ v: string }>("select last_value::text as v from public.client_code_seq");
    const nextClient = `CL-${String(Number(cseq.v) + 1).padStart(4, "0")}`;
    const clientCode = await t.asUser(w.owner.id, async (tx) => {
      await tx.query("insert into public.clients (name, client_code) values ('Manual Client', $1)", [nextClient]);
      const r = await tx.query<{ client_code: string }>("insert into public.clients (name) values ('Auto Client') returning client_code");
      return r.rows[0]?.client_code;
    });
    expect(clientCode).toBe(`CL-${String(Number(cseq.v) + 2).padStart(4, "0")}`);

    // Non-owners get no code (and burn no sequence values).
    const none = await t.asUser(w.sm1.id, (tx) => rpcScalar<string | null>(tx, "next_project_code"));
    expect(none).toBeNull();
  });
});
