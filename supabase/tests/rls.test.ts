import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { count, num, rpc, rpcScalar, TestDatabase } from "./harness";
import { appError, buildWorld, createRequest, type World } from "./fixtures";

const TABLES = [
  "profiles",
  "company_settings",
  "material_categories",
  "clients",
  "projects",
  "project_financials",
  "project_payments",
  "project_payment_links",
  "project_members",
  "project_milestones",
  "project_updates",
  "project_documents",
  "materials",
  "material_requests",
  "material_request_items",
  "material_deliveries",
  "material_request_comments",
  "notifications",
  "audit_logs",
] as const;

const VIEWS = [
  "project_directory",
  "project_financial_summary",
  "client_directory",
  "material_request_directory",
  "material_request_item_directory",
  "project_material_summary",
  "team_directory",
  "activity_feed",
] as const;

let t: TestDatabase;
let w: World;

beforeAll(async () => {
  t = await TestDatabase.create();
  w = await buildWorld(t);
});

afterAll(async () => {
  await t?.close();
});

const ids = (rows: Array<{ id: string }>): string[] => rows.map((r) => r.id).sort();

describe("schema hardening", () => {
  it("enables row level security on every public table", async () => {
    const rows = await t.sql<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'`,
    );
    expect(rows.length).toBe(TABLES.length);
    for (const row of rows) expect(row.relrowsecurity, row.relname).toBe(true);
  });

  it("gives anon no table, view or sequence privileges", async () => {
    const rows = await t.sql<{ table_name: string; privilege_type: string }>(
      `select table_name, privilege_type from information_schema.role_table_grants
       where table_schema = 'public' and grantee in ('anon', 'PUBLIC')`,
    );
    expect(rows).toEqual([]);
  });

  it("does not let anon or PUBLIC execute any public function except the payment statement", async () => {
    const rows = await t.sql<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and (has_function_privilege('anon', p.oid, 'execute'))`,
    );
    // get_payment_statement is the public share-link entry point (0009); it returns
    // NULL unless given a valid secret token.
    expect(rows.map((r) => r.proname)).toEqual(["get_payment_statement"]);
  });

  it("sets an explicit empty search_path on every public function", async () => {
    const rows = await t.sql<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and not coalesce(p.proconfig @> array['search_path=""'], false)`,
    );
    expect(rows.map((r) => r.proname)).toEqual([]);
  });

  it("keeps bootstrap functions away from API users", async () => {
    const rows = await t.sql<{ auth: boolean; svc: boolean }>(
      `select has_function_privilege('authenticated', 'public.promote_to_owner(text)', 'execute') as auth,
              has_function_privilege('service_role', 'public.promote_to_owner(text)', 'execute') as svc`,
    );
    expect(rows[0]).toEqual({ auth: false, svc: true });
    const internal = await t.sql<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('notify_user', 'raise_app_error', 'insert_request_items', 'require_active_role',
                           'refresh_material_request_totals', 'audit_row_change')
         and has_function_privilege('authenticated', p.oid, 'execute')`,
    );
    expect(internal).toEqual([]);
  });
});

describe("owner", () => {
  it("sees every row of every table", async () => {
    for (const table of TABLES) {
      if (table === "notifications") continue; // notifications are per user by design
      const total = await count(t.db, `public.${table}`);
      const visible = await t.asUser(w.owner.id, (tx) => count(tx, `public.${table}`));
      expect(visible, table).toBe(total);
    }
  });

  it("sees all projects, clients and financials through the views", async () => {
    await t.asUser(w.owner.id, async (tx) => {
      expect(await count(tx, "public.project_directory")).toBe(2);
      expect(await count(tx, "public.client_directory")).toBe(2);
      expect(await count(tx, "public.project_financial_summary")).toBe(2);
      expect(await count(tx, "public.material_request_directory")).toBe(3);
    });
  });
});

describe("site manager isolation", () => {
  it("sees only their own project, client, updates and requests", async () => {
    await t.asUser(w.sm1.id, async (tx) => {
      const projects = await tx.query<{ id: string }>("select id from public.projects");
      expect(ids(projects.rows)).toEqual([w.projectA]);
      const clients = await tx.query<{ id: string }>("select id from public.clients");
      expect(ids(clients.rows)).toEqual([w.clientA]);
      expect(await count(tx, "public.project_updates", "project_id = $1", [w.projectB])).toBe(0);
      expect(await count(tx, "public.material_requests", "project_id = $1", [w.projectB])).toBe(0);
      expect(await count(tx, "public.material_request_items", "request_id = $1", [w.requestB1])).toBe(0);
      expect(await count(tx, "public.project_milestones", "project_id = $1", [w.projectB])).toBe(0);
      expect(await count(tx, "public.project_directory", "id = $1", [w.projectB])).toBe(0);
      expect(await count(tx, "public.client_directory", "id = $1", [w.clientB])).toBe(0);
      expect(await count(tx, "public.material_request_directory", "project_id = $1", [w.projectB])).toBe(0);
      expect(await count(tx, "public.project_material_summary", "project_id = $1", [w.projectB])).toBe(0);
      expect(await count(tx, "public.activity_feed", "project_id = $1", [w.projectB])).toBe(0);
      expect(await count(tx, "public.project_directory", "id = $1", [w.projectA])).toBe(1);
    });
  });

  it("cannot read project financials unless explicitly granted", async () => {
    await t.asUser(w.sm1.id, async (tx) => {
      expect(await count(tx, "public.project_financials")).toBe(0);
      expect(await count(tx, "public.project_financial_summary")).toBe(0);
    });
  });

  it("can see material costs of requests on their own project", async () => {
    const rows = await t.asUser(w.sm1.id, (tx) =>
      tx.query<{ estimated_cost: string }>("select estimated_cost from public.material_requests where id = $1", [
        w.requestA1,
      ]),
    );
    expect(num(rows.rows[0]?.estimated_cost)).toBe(42000);
  });

  it("is rejected with NOT_AUTHORIZED when calling RPCs on another site manager's project", async () => {
    await expect(
      t.asUser(w.sm1.id, (tx) =>
        rpc(tx, "submit_project_update", {
          p_project_id: w.projectB,
          p_status: "execution",
          p_progress: 90,
          p_update_date: null,
          p_milestone: null,
          p_expected_completion_date: null,
          p_issues: null,
          p_notes: "Trying to edit someone else's project",
          p_next_action: null,
        }),
      ),
    ).rejects.toThrow(appError("NOT_AUTHORIZED"));

    await expect(
      createRequest(t, w.sm1.id, w.projectB, [{ material_name: "Sand", quantity: 10, unit: "Cu Ft" }]),
    ).rejects.toThrow(appError("NOT_AUTHORIZED"));

    await expect(
      t.asUser(w.sm1.id, (tx) =>
        rpc(tx, "update_material_request_status", { p_request_id: w.requestB1, p_status: "cancelled" }),
      ),
    ).rejects.toThrow(appError("NOT_AUTHORIZED"));

    await expect(
      t.asUser(w.sm1.id, (tx) => rpc(tx, "add_material_request_comment", { p_request_id: w.requestB1, p_body: "hi" })),
    ).rejects.toThrow(appError("NOT_AUTHORIZED"));
  });

  it("cannot write projects or clients directly", async () => {
    const updated = await t.asUser(w.sm1.id, (tx) =>
      tx.query("update public.projects set progress_percentage = 99 where id = $1", [w.projectA]),
    );
    expect(updated.affectedRows ?? 0).toBe(0);
    const row = await t.one<{ p: string }>("select progress_percentage as p from public.projects where id = $1", [
      w.projectA,
    ]);
    expect(num(row.p)).toBe(60);

    await expect(
      t.asUser(w.sm1.id, (tx) => tx.query("insert into public.clients (name) values ('Sneaky Client')")),
    ).rejects.toThrow(/row-level security/);
    await expect(
      t.asUser(w.sm1.id, (tx) =>
        tx.query("insert into public.material_requests (project_id, requested_by, title, required_date) values ($1, $2, 'x', current_date)", [
          w.projectA,
          w.sm1.id,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      t.asUser(w.sm1.id, (tx) =>
        tx.query(
          "insert into public.project_members (project_id, user_id, member_role) values ($1, $2, 'site_manager')",
          [w.projectB, w.sm1.id],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("cannot see other users' profiles but can see the team directory without contact details", async () => {
    await t.asUser(w.sm1.id, async (tx) => {
      const profiles = await tx.query<{ id: string }>("select id from public.profiles");
      expect(ids(profiles.rows)).toEqual([w.sm1.id]);
      const team = await tx.query<Record<string, unknown>>("select * from public.team_directory");
      expect(team.rows.length).toBeGreaterThanOrEqual(5);
      expect(Object.keys(team.rows[0] ?? {})).not.toContain("email");
      expect(Object.keys(team.rows[0] ?? {})).not.toContain("phone");
    });
  });
});

describe("admin isolation", () => {
  it("cannot read clients or project financials at all", async () => {
    await t.asUser(w.admin1.id, async (tx) => {
      expect(await count(tx, "public.clients")).toBe(0);
      expect(await count(tx, "public.client_directory")).toBe(0);
      expect(await count(tx, "public.project_financials")).toBe(0);
      expect(await count(tx, "public.project_financial_summary")).toBe(0);
    });
  });

  it("project_directory exposes no cost columns but includes the client name", async () => {
    const columns = await t.sql<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'project_directory'`,
    );
    const names = columns.map((c) => c.column_name);
    expect(names).toContain("client_name");
    for (const forbidden of ["project_cost", "advance_received", "email", "phone"]) {
      expect(names).not.toContain(forbidden);
    }
    const rows = await t.asUser(w.admin1.id, (tx) =>
      tx.query<{ id: string; client_name: string }>("select id, client_name from public.project_directory"),
    );
    expect(rows.rows.map((r) => r.id)).toEqual([w.projectA]);
    expect(rows.rows[0]?.client_name).toBe("Mr. Kumar");
  });

  it("sees assigned and unassigned requests but not requests assigned to another admin", async () => {
    const admin1Rows = await t.asUser(w.admin1.id, (tx) =>
      tx.query<{ id: string }>("select id from public.material_requests"),
    );
    expect(ids(admin1Rows.rows)).toEqual([w.requestA1, w.requestA2].sort());

    const admin2Rows = await t.asUser(w.admin2.id, (tx) =>
      tx.query<{ id: string }>("select id from public.material_requests"),
    );
    expect(ids(admin2Rows.rows)).toEqual([w.requestA1, w.requestB1].sort());

    await expect(
      t.asUser(w.admin1.id, (tx) =>
        rpc(tx, "update_material_request_status", { p_request_id: w.requestB1, p_status: "pending_review" }),
      ),
    ).rejects.toThrow(appError("NOT_AUTHORIZED"));
  });

  it("does not see site update history of projects reached only through requests", async () => {
    await t.asUser(w.admin2.id, async (tx) => {
      expect(await count(tx, "public.projects", "id = $1", [w.projectB])).toBe(1);
      expect(await count(tx, "public.project_updates")).toBe(0);
      expect(await count(tx, "public.project_documents")).toBe(0);
    });
  });

  it("cannot create material requests or post project updates", async () => {
    await expect(
      createRequest(t, w.admin1.id, w.projectA, [{ material_name: "Sand", quantity: 10, unit: "Cu Ft" }]),
    ).rejects.toThrow(appError("NOT_AUTHORIZED"));
  });

  it("cannot assign requests to other admins or steal assigned ones", async () => {
    await expect(
      t.asUser(w.admin1.id, (tx) =>
        rpc(tx, "assign_material_request", { p_request_id: w.requestA1, p_admin_id: w.admin2.id }),
      ),
    ).rejects.toThrow(appError("NOT_AUTHORIZED"));
  });
});

describe("anonymous access", () => {
  for (const relation of [...TABLES, ...VIEWS]) {
    it(`anon cannot read ${relation}`, async () => {
      await expect(t.asAnon((tx) => tx.query(`select * from public.${relation} limit 1`))).rejects.toThrow(
        /permission denied/,
      );
    });
  }

  it("anon cannot call RPCs or helper functions", async () => {
    await expect(t.asAnon((tx) => rpc(tx, "get_owner_dashboard"))).rejects.toThrow(/permission denied/);
    await expect(t.asAnon((tx) => rpc(tx, "global_search", { p_query: "Kumar" }))).rejects.toThrow(
      /permission denied/,
    );
    await expect(t.asAnon((tx) => rpc(tx, "is_owner"))).rejects.toThrow(/permission denied/);
    await expect(t.asAnon((tx) => rpc(tx, "generate_deadline_notifications"))).rejects.toThrow(/permission denied/);
  });

  it("anon cannot read or write project documents in storage", async () => {
    await expect(
      t.asAnon((tx) =>
        tx.query("insert into storage.objects (bucket_id, name) values ('project-documents', $1)", [
          `${w.projectA}/photos/anon.jpg`,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("deactivated and role-less users", () => {
  it("a deactivated site manager sees nothing and every RPC fails", async () => {
    const sm = await t.createUser("site_manager", "Departed SM", { employeeId: "SM-99" });
    await t.addMember(w.projectA, sm.id, "site_manager");
    expect(await t.asUser(sm.id, (tx) => count(tx, "public.projects"))).toBe(1);

    await t.asUser(w.owner.id, (tx) => rpc(tx, "set_user_status", { p_user_id: sm.id, p_status: "inactive" }));

    await t.asUser(sm.id, async (tx) => {
      for (const relation of [...TABLES, ...VIEWS]) {
        if (relation === "profiles") continue;
        expect(await count(tx, `public.${relation}`), relation).toBe(0);
      }
      const own = await tx.query<{ id: string; status: string }>("select id, status from public.profiles");
      expect(own.rows).toEqual([{ id: sm.id, status: "inactive" }]);
    });

    await expect(
      t.asUser(sm.id, (tx) =>
        rpc(tx, "submit_project_update", {
          p_project_id: w.projectA,
          p_status: "execution",
          p_progress: 70,
          p_update_date: null,
          p_milestone: null,
          p_expected_completion_date: null,
          p_issues: null,
          p_notes: null,
          p_next_action: null,
        }),
      ),
    ).rejects.toThrow(appError("INACTIVE_USER"));
    await expect(t.asUser(sm.id, (tx) => rpc(tx, "global_search", { p_query: "Kumar" }))).rejects.toThrow(
      appError("INACTIVE_USER"),
    );
    await expect(
      t.asUser(sm.id, (tx) => tx.query("update public.profiles set full_name = 'Still here' where id = $1", [sm.id])),
    ).resolves.toMatchObject({ affectedRows: 0 });
  });

  it("a user without a role sees nothing", async () => {
    const nobody = await t.createUser(null, "No Role");
    await t.asUser(nobody.id, async (tx) => {
      expect(await count(tx, "public.projects")).toBe(0);
      expect(await count(tx, "public.materials")).toBe(0);
      expect(await count(tx, "public.team_directory")).toBe(0);
    });
    await expect(t.asUser(nobody.id, (tx) => rpc(tx, "mark_all_notifications_read"))).rejects.toThrow(
      appError("NOT_AUTHORIZED"),
    );
  });

  it("an unknown JWT subject sees nothing", async () => {
    const ghost = "00000000-0000-4000-8000-000000000001";
    await t.asUser(ghost, async (tx) => {
      expect(await count(tx, "public.projects")).toBe(0);
      expect(await count(tx, "public.profiles")).toBe(0);
    });
  });
});

describe("profile protection", () => {
  it("blocks self role escalation and protected field changes", async () => {
    const attempts = [
      "role = 'owner'",
      "role = 'admin'",
      "status = 'inactive'",
      "employee_id = 'OWN-99'",
      "email = 'someone.else@example.in'",
      "joining_date = date '2020-01-01'",
      "deactivated_at = now()",
    ];
    for (const assignment of attempts) {
      await expect(
        t.asUser(w.sm1.id, (tx) => tx.query(`update public.profiles set ${assignment} where id = $1`, [w.sm1.id])),
        assignment,
      ).rejects.toThrow(appError("NOT_AUTHORIZED"));
    }
    const profile = await t.one<{ role: string }>("select role from public.profiles where id = $1", [w.sm1.id]);
    expect(profile.role).toBe("site_manager");
  });

  it("lets users edit their own name and phone but not other profiles", async () => {
    await t.asUser(w.sm1.id, (tx) =>
      tx.query("update public.profiles set full_name = 'Ravi', phone = '+91 98450 00000' where id = $1", [w.sm1.id]),
    );
    const res = await t.asUser(w.sm1.id, (tx) =>
      tx.query("update public.profiles set full_name = 'Hacked' where id = $1", [w.sm2.id]),
    );
    expect(res.affectedRows ?? 0).toBe(0);
    const other = await t.one<{ full_name: string }>("select full_name from public.profiles where id = $1", [w.sm2.id]);
    expect(other.full_name).toBe("Suresh");
  });

  it("lets the owner manage staff fields but never mint or demote owners", async () => {
    await t.asUser(w.owner.id, (tx) =>
      tx.query("update public.profiles set employee_id = 'AD-11' where id = $1", [w.admin2.id]),
    );
    await t.asUser(w.owner.id, (tx) =>
      tx.query("update public.profiles set employee_id = 'AD-02' where id = $1", [w.admin2.id]),
    );
    await expect(
      t.asUser(w.owner.id, (tx) => tx.query("update public.profiles set role = 'owner' where id = $1", [w.admin2.id])),
    ).rejects.toThrow(appError("NOT_AUTHORIZED"));
    await expect(
      t.asUser(w.owner.id, (tx) =>
        tx.query("update public.profiles set status = 'inactive' where id = $1", [w.owner.id]),
      ),
    ).rejects.toThrow(appError("NOT_AUTHORIZED"));
    await expect(
      t.asUser(w.owner.id, (tx) => rpc(tx, "set_user_status", { p_user_id: w.owner.id, p_status: "inactive" })),
    ).rejects.toThrow(appError("NOT_AUTHORIZED"));
  });

  it("only takes the role from app_metadata, never from user_metadata", async () => {
    const id = "11111111-2222-4333-8444-555555555555";
    await t.sql(
      `insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
       values ($1, 'self.signup@example.in', '{}'::jsonb, '{"full_name":"Self Signup","role":"owner"}'::jsonb)`,
      [id],
    );
    const row = await t.one<{ role: string | null }>("select role from public.profiles where id = $1", [id]);
    expect(row.role).toBeNull();
  });
});

describe("append-only and owned-row tables", () => {
  it("audit_logs cannot be changed by authenticated users, nor by the database owner", async () => {
    await expect(
      t.asUser(w.owner.id, (tx) => tx.query("update public.audit_logs set summary = 'tampered'")),
    ).rejects.toThrow(/permission denied/);
    await expect(t.asUser(w.owner.id, (tx) => tx.query("delete from public.audit_logs"))).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      t.asUser(w.owner.id, (tx) =>
        tx.query("insert into public.audit_logs (action, entity_type, summary) values ('insert', 'x', 'forged')"),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(t.sql("update public.audit_logs set summary = 'tampered'")).rejects.toThrow(appError("NOT_AUTHORIZED"));
    await expect(t.sql("delete from public.audit_logs")).rejects.toThrow(appError("NOT_AUTHORIZED"));
    await expect(t.sql("truncate public.audit_logs")).rejects.toThrow(appError("NOT_AUTHORIZED"));
  });

  it("project update history cannot be edited", async () => {
    await expect(
      t.asUser(w.owner.id, (tx) => tx.query("update public.project_updates set notes = 'rewritten'")),
    ).rejects.toThrow(/permission denied/);
    await expect(t.sql("update public.project_updates set notes = 'rewritten'")).rejects.toThrow(
      appError("NOT_AUTHORIZED"),
    );
  });

  it("notifications are private and only read_at can change", async () => {
    const ownerNotifications = await t.asUser(w.owner.id, (tx) => count(tx, "public.notifications"));
    expect(ownerNotifications).toBeGreaterThan(0);
    const smSeesOwners = await t.asUser(w.sm1.id, (tx) =>
      count(tx, "public.notifications", "user_id = $1", [w.owner.id]),
    );
    expect(smSeesOwners).toBe(0);
    await expect(
      t.asUser(w.owner.id, (tx) => tx.query("update public.notifications set title = 'changed'")),
    ).rejects.toThrow(/permission denied/);
    await t.asUser(w.owner.id, (tx) => tx.query("update public.notifications set read_at = now()"));
    const unread = await t.asUser(w.owner.id, (tx) => count(tx, "public.notifications", "read_at is null"));
    expect(unread).toBe(0);
    const othersTouched = await t.asUser(w.sm1.id, (tx) =>
      tx.query("update public.notifications set read_at = null where user_id = $1", [w.owner.id]),
    );
    expect(othersTouched.affectedRows ?? 0).toBe(0);
  });
});

describe("storage policies", () => {
  it("site managers upload only into their own project folders", async () => {
    await t.asUser(w.sm1.id, (tx) =>
      tx.query("insert into storage.objects (bucket_id, name) values ('project-documents', $1)", [
        `${w.projectA}/photos/1f0b-ceiling.jpg`,
      ]),
    );
    await expect(
      t.asUser(w.sm1.id, (tx) =>
        tx.query("insert into storage.objects (bucket_id, name) values ('project-documents', $1)", [
          `${w.projectB}/photos/1f0b-ceiling.jpg`,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      t.asUser(w.sm1.id, (tx) =>
        tx.query("insert into storage.objects (bucket_id, name) values ('project-documents', $1)", [
          `${w.projectA}/not-a-category/file.jpg`,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      t.asUser(w.sm1.id, (tx) =>
        tx.query("insert into storage.objects (bucket_id, name) values ('project-documents', $1)", ["../etc/passwd"]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("admins cannot upload and only members can read objects", async () => {
    await expect(
      t.asUser(w.admin1.id, (tx) =>
        tx.query("insert into storage.objects (bucket_id, name) values ('project-documents', $1)", [
          `${w.projectA}/photos/admin.jpg`,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
    expect(await t.asUser(w.sm2.id, (tx) => count(tx, "storage.objects"))).toBe(0);
    expect(await t.asUser(w.sm1.id, (tx) => count(tx, "storage.objects"))).toBe(1);
    expect(await t.asUser(w.owner.id, (tx) => count(tx, "storage.objects"))).toBe(1);
  });

  it("the bucket is private with a 25 MB limit", async () => {
    const bucket = await t.one<{ public: boolean; file_size_limit: string }>(
      "select public, file_size_limit from storage.buckets where id = 'project-documents'",
    );
    expect(bucket.public).toBe(false);
    expect(num(bucket.file_size_limit)).toBe(25 * 1024 * 1024);
  });
});

describe("global search", () => {
  it("only returns entities the caller can access", async () => {
    // "ce" matches both "Kumar Residence" and "Mehta Office"; "Mr" matches both clients.
    const smProjects = await t.asUser(w.sm1.id, (tx) =>
      rpc<{ entity_type: string; entity_id: string }>(tx, "global_search", { p_query: "ce" }),
    );
    const smClients = await t.asUser(w.sm1.id, (tx) =>
      rpc<{ entity_type: string; entity_id: string }>(tx, "global_search", { p_query: "Mr" }),
    );
    const smResults = [...smProjects, ...smClients];
    const smIds = smResults.map((r) => r.entity_id);
    expect(smIds).toContain(w.clientA);
    expect(smIds).toContain(w.projectA);
    expect(smIds).not.toContain(w.projectB);
    expect(smIds).not.toContain(w.clientB);
    expect(smIds).not.toContain(w.requestB1);
    expect(smResults.some((r) => r.entity_type === "site_manager" || r.entity_type === "admin")).toBe(false);

    const adminResults = await t.asUser(w.admin1.id, (tx) =>
      rpc<{ entity_type: string; entity_id: string }>(tx, "global_search", { p_query: "MR-" }),
    );
    const adminIds = adminResults.map((r) => r.entity_id);
    expect(adminIds).toContain(w.requestA2);
    expect(adminIds).not.toContain(w.requestB1);
    expect(adminResults.some((r) => r.entity_type === "client")).toBe(false);
  });

  it("matches codes and employee IDs for the owner", async () => {
    const code = await t.one<{ project_code: string }>("select project_code from public.projects where id = $1", [
      w.projectB,
    ]);
    const results = await t.asUser(w.owner.id, (tx) =>
      rpc<{ entity_id: string; href: string }>(tx, "global_search", { p_query: code.project_code }),
    );
    expect(results[0]?.entity_id).toBe(w.projectB);
    expect(results[0]?.href).toBe(`/projects/${w.projectB}`);

    const staff = await t.asUser(w.owner.id, (tx) =>
      rpc<{ entity_id: string; entity_type: string }>(tx, "global_search", { p_query: "SM-05" }),
    );
    expect(staff[0]).toMatchObject({ entity_id: w.sm2.id, entity_type: "site_manager" });

    const empty = await t.asUser(w.owner.id, (tx) => rpc(tx, "global_search", { p_query: "%" }));
    expect(empty).toEqual([]);
  });

  it("treats LIKE wildcards literally", async () => {
    const results = await t.asUser(w.owner.id, (tx) => rpc(tx, "global_search", { p_query: "%%" }));
    expect(results).toEqual([]);
    const underscore = await t.asUser(w.owner.id, (tx) => rpc(tx, "global_search", { p_query: "__" }));
    expect(underscore).toEqual([]);
  });
});

describe("financial grants", () => {
  it("a member granted can_view_financials sees only that project's money", async () => {
    await t.asUser(w.owner.id, (tx) =>
      rpcScalar(tx, "assign_project_member", {
        p_project_id: w.projectA,
        p_user_id: w.sm1.id,
        p_member_role: "site_manager",
        p_can_view_financials: true,
      }),
    );
    const rows = await t.asUser(w.sm1.id, (tx) =>
      tx.query<{ project_id: string; project_cost: string }>(
        "select project_id, project_cost from public.project_financial_summary",
      ),
    );
    expect(rows.rows.map((r) => r.project_id)).toEqual([w.projectA]);
    expect(num(rows.rows[0]?.project_cost)).toBe(400000);
    await t.asUser(w.owner.id, (tx) =>
      rpcScalar(tx, "assign_project_member", {
        p_project_id: w.projectA,
        p_user_id: w.sm1.id,
        p_member_role: "site_manager",
        p_can_view_financials: false,
      }),
    );
    expect(await t.asUser(w.sm1.id, (tx) => count(tx, "public.project_financials"))).toBe(0);
  });
});
