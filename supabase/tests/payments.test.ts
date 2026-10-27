import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { count, num, rpcScalar, TestDatabase } from "./harness";
import { buildWorld, type World } from "./fixtures";

/** Payments ledger, shareable statements and the 0009 advance backfill. */
let t: TestDatabase;
let w: World;

beforeAll(async () => {
  t = await TestDatabase.create();
  w = await buildWorld(t);
});

afterAll(async () => {
  await t?.close();
});

type Statement = {
  company: { name: string; phone: string | null };
  project: { code: string; name: string; client_name: string };
  totals: { project_cost: number; received: number; balance: number };
  by_mode: Array<{ mode: string; amount: number; count: number }>;
  payments: Array<{ paid_on: string; mode: string; amount: number; reference: string | null; notes?: string }>;
};

async function addPayment(projectId: string, amount: number, mode: string, reference: string | null = null) {
  return t.asUser(w.owner.id, async (tx) => {
    const res = await tx.query<{ id: string }>(
      `insert into public.project_payments (project_id, amount, mode, reference, notes)
       values ($1, $2, $3::public.payment_mode, $4, 'internal note') returning id`,
      [projectId, amount, mode, reference],
    );
    return res.rows[0]!.id;
  });
}

async function createLink(projectId: string, token: string) {
  await t.asUser(w.owner.id, (tx) =>
    tx.query("insert into public.project_payment_links (project_id, token) values ($1, $2)", [projectId, token]),
  );
}

describe("project payments", () => {
  it("lets the owner record payments and rolls them into the financial summary", async () => {
    await addPayment(w.projectA, 100000, "upi", "UPI-REF-1");
    await addPayment(w.projectA, 50000, "cash");
    await addPayment(w.projectA, 25000.5, "upi");

    const row = await t.asUser(w.owner.id, (tx) =>
      tx.query<{ advance_received: string; payment_count: number; project_cost: string }>(
        "select advance_received, payment_count, project_cost from public.project_financial_summary where project_id = $1",
        [w.projectA],
      ),
    );
    expect(num(row.rows[0]?.advance_received)).toBe(175000.5);
    expect(row.rows[0]?.payment_count).toBe(3);
    expect(num(row.rows[0]?.project_cost)).toBe(400000);
  });

  it("rejects zero or negative amounts", async () => {
    await expect(addPayment(w.projectA, 0, "cash")).rejects.toThrow(/check constraint/);
    await expect(addPayment(w.projectA, -5, "cash")).rejects.toThrow(/check constraint/);
  });

  it("hides payments from site managers and admins without financial access", async () => {
    for (const user of [w.sm1, w.admin1]) {
      const n = await t.asUser(user.id, (tx) => count(tx, "public.project_payments", "project_id = $1", [w.projectA]));
      expect(n, user.name).toBe(0);
    }
  });

  it("shows payments (read-only) to members granted financial access", async () => {
    const project = await t.createProject(w.clientA, { cost: 200000 });
    await t.addMember(project, w.sm2.id, "site_manager", true);
    await addPayment(project, 20000, "card");

    const n = await t.asUser(w.sm2.id, (tx) => count(tx, "public.project_payments", "project_id = $1", [project]));
    expect(n).toBe(1);
    await expect(
      t.asUser(w.sm2.id, (tx) =>
        tx.query("insert into public.project_payments (project_id, amount, mode) values ($1, 10, 'cash')", [project]),
      ),
    ).rejects.toThrow(/row-level security/);
    const updated = await t.asUser(w.sm2.id, (tx) =>
      tx.query("update public.project_payments set amount = 1 where project_id = $1", [project]),
    );
    expect(updated.affectedRows ?? 0).toBe(0);
    // Members never read the share token.
    await createLink(project, "member-cannot-see-this-token-0000000000");
    const links = await t.asUser(w.sm2.id, (tx) => count(tx, "public.project_payment_links"));
    expect(links).toBe(0);
  });

  it("writes payment audit rows that members cannot read", async () => {
    const rows = await t.sql<{ summary: string }>(
      "select summary from public.audit_logs where entity_type = 'project_payments' and project_id = $1 order by created_at",
      [w.projectA],
    );
    expect(rows.some((r) => /recorded a payment of .*\(UPI\)/.test(r.summary))).toBe(true);
    const visible = await t.asUser(w.sm1.id, (tx) =>
      count(tx, "public.audit_logs", "entity_type in ('project_payments', 'project_payment_links')"),
    );
    expect(visible).toBe(0);
  });
});

describe("payment statement link", () => {
  const token = "Zx9_test-token-abcdefghijklmnopqrstuvwxyz012345";

  it("returns the statement to anon for a valid token without internal notes", async () => {
    await createLink(w.projectA, token);
    const statement = await t.asAnon((tx) =>
      rpcScalar<Statement>(tx, "get_payment_statement", { p_token: token }),
    );
    expect(statement.project.name).toBe("Kumar Residence");
    expect(statement.project.client_name).toBe("Mr. Kumar");
    expect(num(statement.totals.project_cost)).toBe(400000);
    expect(num(statement.totals.received)).toBe(175000.5);
    expect(num(statement.totals.balance)).toBe(224999.5);
    const upi = statement.by_mode.find((m) => m.mode === "upi");
    expect(num(upi?.amount)).toBe(125000.5);
    expect(upi?.count).toBe(2);
    expect(statement.payments).toHaveLength(3);
    expect(statement.payments.some((p) => p.reference === "UPI-REF-1")).toBe(true);
    expect(JSON.stringify(statement)).not.toContain("internal note");
  });

  it("returns null for unknown, malformed or disabled tokens", async () => {
    for (const bad of ["unknown-token-unknown-token-unknown-token", "short", "x' or '1'='1", ""]) {
      const result = await t.asAnon((tx) => rpcScalar<Statement | null>(tx, "get_payment_statement", { p_token: bad }));
      expect(result, bad).toBeNull();
    }
    const temp = "temporary-token-temporary-token-temporary";
    const project = await t.createProject(w.clientB, { cost: 1000 });
    await createLink(project, temp);
    await t.asUser(w.owner.id, (tx) => tx.query("delete from public.project_payment_links where project_id = $1", [project]));
    expect(await t.asAnon((tx) => rpcScalar(tx, "get_payment_statement", { p_token: temp }))).toBeNull();
  });

  it("stops the old link working after regeneration", async () => {
    const next = "regenerated-token-regenerated-token-000000";
    await t.asUser(w.owner.id, (tx) =>
      tx.query("update public.project_payment_links set token = $2 where project_id = $1", [w.projectA, next]),
    );
    expect(await t.asAnon((tx) => rpcScalar(tx, "get_payment_statement", { p_token: token }))).toBeNull();
    const statement = await t.asAnon((tx) => rpcScalar<Statement>(tx, "get_payment_statement", { p_token: next }));
    expect(statement.project.name).toBe("Kumar Residence");
    const audit = await t.sql<{ new_data: Record<string, unknown> }>(
      "select new_data from public.audit_logs where entity_type = 'project_payment_links' and project_id = $1",
      [w.projectA],
    );
    expect(audit.length).toBeGreaterThan(0);
    for (const row of audit) expect(JSON.stringify(row.new_data ?? {})).not.toContain("token");
  });

  it("does not let anon read the ledger or links directly", async () => {
    await expect(t.asAnon((tx) => tx.query("select * from public.project_payments"))).rejects.toThrow(/permission denied/);
    await expect(t.asAnon((tx) => tx.query("select * from public.project_payment_links"))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("0009 backfill", () => {
  let legacy: TestDatabase;

  afterAll(async () => {
    await legacy?.close();
  });

  it("copies advances recorded before the ledger into opening payments", async () => {
    legacy = await TestDatabase.create({ before: "0009" });
    const client = await legacy.createClient("Legacy Client");
    const withAdvance = await legacy.createProject(client, { cost: 500000 });
    const without = await legacy.createProject(client, { cost: 300000 });
    await legacy.sql("update public.project_financials set advance_received = 120000 where project_id = $1", [withAdvance]);

    await legacy.applyMigration("0009_project_payments.sql");

    const payments = await legacy.sql<{ project_id: string; amount: string; mode: string }>(
      "select project_id, amount, mode from public.project_payments",
    );
    expect(payments).toHaveLength(1);
    expect(payments[0]?.project_id).toBe(withAdvance);
    expect(num(payments[0]?.amount)).toBe(120000);
    expect(payments[0]?.mode).toBe("other");
    expect(payments.some((p) => p.project_id === without)).toBe(false);
  });
});
