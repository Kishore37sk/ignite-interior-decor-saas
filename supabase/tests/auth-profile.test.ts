import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { rpc, TestDatabase } from "./harness";
import { appError, buildWorld, type World } from "./fixtures";

/**
 * Supabase Auth's admin createUser() inserts auth.users first and writes
 * app_metadata in a follow-up UPDATE. Profiles must still get their role.
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

type ProfileRow = { role: string | null; status: string; employee_id: string | null };

const profileOf = (id: string) =>
  t.one<ProfileRow>("select role, status, employee_id from public.profiles where id = $1", [id]);

/** Mimics GoTrue: INSERT without role, then UPDATE app_metadata. */
async function createLikeSupabaseAuth(appMeta: Record<string, string>): Promise<string> {
  const id = randomUUID();
  await t.sql(
    "insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values ($1, $2, $3, $4)",
    [id, `staff.${id.slice(0, 8)}@test.igniteinteriordecor.com`, JSON.stringify({ provider: "email" }), JSON.stringify({ full_name: "Two Step" })],
  );
  await t.sql("update auth.users set raw_app_meta_data = raw_app_meta_data || $2::jsonb where id = $1", [id, JSON.stringify(appMeta)]);
  return id;
}

describe("profile role from app_metadata written after insert", () => {
  it("gives an admin created in two steps its role, employee ID and active status", async () => {
    const id = await createLikeSupabaseAuth({ role: "admin", employee_id: "AD077" });
    expect(await profileOf(id)).toEqual({ role: "admin", status: "active", employee_id: "AD077" });
  });

  it("works for site managers too", async () => {
    const id = await createLikeSupabaseAuth({ role: "site_manager", employee_id: "SM077" });
    expect(await profileOf(id)).toEqual({ role: "site_manager", status: "active", employee_id: "SM077" });
  });

  it("never changes a role that is already set", async () => {
    const admin = await t.createUser("admin", "Fixed Role Admin");
    await t.sql("update auth.users set raw_app_meta_data = raw_app_meta_data || '{\"role\":\"owner\"}'::jsonb where id = $1", [admin.id]);
    expect((await profileOf(admin.id)).role).toBe("admin");
  });

  it("ignores unknown roles and skips a duplicate employee ID instead of failing the auth write", async () => {
    const bogus = await createLikeSupabaseAuth({ role: "superuser" });
    expect(await profileOf(bogus)).toMatchObject({ role: null, status: "inactive" });

    const dup = await createLikeSupabaseAuth({ role: "admin", employee_id: "AD077" });
    expect(await profileOf(dup)).toEqual({ role: "admin", status: "active", employee_id: null });
  });

  it("leaves deactivated staff alone (they keep their role)", async () => {
    const admin = await t.createUser("admin", "Deactivated Admin", { status: "inactive" });
    await t.sql("update auth.users set raw_app_meta_data = raw_app_meta_data || '{\"note\":\"x\"}'::jsonb where id = $1", [admin.id]);
    expect(await profileOf(admin.id)).toMatchObject({ role: "admin", status: "inactive" });
  });
});

describe("set_user_status", () => {
  it("refuses to activate a profile without a role", async () => {
    const roleless = await t.createUser(null, "Roleless Person");
    await expect(
      t.asUser(w.owner.id, (tx) => rpc(tx, "set_user_status", { p_user_id: roleless.id, p_status: "active" })),
    ).rejects.toThrow(appError("VALIDATION"));
    expect((await profileOf(roleless.id)).status).toBe("inactive");
  });
});
