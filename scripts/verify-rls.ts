/**
 * Live row-level-security check against the real Supabase project.
 *
 *   npm run verify:rls
 *
 * Signs in with the PUBLIC anon key as the demo accounts created by
 * scripts/seed-demo.ts (SM001, SM002, AD001, AD002; password DEMO_USER_PASSWORD)
 * and asserts that:
 *   - anonymous requests read nothing,
 *   - a site manager cannot read the other site manager's projects/clients/requests,
 *   - site managers and admins cannot read project financials,
 *   - admins cannot read the clients table or requests assigned to another admin,
 *   - owner-only RPCs are refused.
 * Prints a PASS/FAIL table and exits with code 1 when any check fails.
 * The service-role key is NOT used.
 */
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const DEMO_DOMAIN = "demo.igniteinteriordecor.com";
const ACCOUNTS = {
  sm1: { label: "SM001", email: process.env.VERIFY_SM1_EMAIL ?? `sm01@${DEMO_DOMAIN}` },
  sm2: { label: "SM002", email: process.env.VERIFY_SM2_EMAIL ?? `sm02@${DEMO_DOMAIN}` },
  ad1: { label: "AD001", email: process.env.VERIFY_AD1_EMAIL ?? `admin01@${DEMO_DOMAIN}` },
  ad2: { label: "AD002", email: process.env.VERIFY_AD2_EMAIL ?? `admin02@${DEMO_DOMAIN}` },
} as const;
type AccountKey = keyof typeof ACCOUNTS;

const PROTECTED_RELATIONS = [
  "profiles",
  "clients",
  "projects",
  "project_financials",
  "project_members",
  "project_updates",
  "material_requests",
  "material_request_items",
  "notifications",
  "audit_logs",
  "project_directory",
  "client_directory",
  "project_financial_summary",
  "material_request_directory",
  "activity_feed",
] as const;

interface CheckResult {
  check: string;
  pass: boolean;
  detail: string;
}

const results: CheckResult[] = [];

function record(check: string, pass: boolean, detail: string): void {
  results.push({ check, pass, detail });
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}. Set it in .env.local.`);
  return value;
}

function newClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function signIn(url: string, anonKey: string, key: AccountKey, password: string): Promise<SupabaseClient | null> {
  const client = newClient(url, anonKey);
  const { error } = await client.auth.signInWithPassword({ email: ACCOUNTS[key].email, password });
  record(`${ACCOUNTS[key].label} can sign in`, !error, error ? error.message : ACCOUNTS[key].email);
  return error ? null : client;
}

async function selectIds(client: SupabaseClient, relation: string, column = "id"): Promise<{ ids: string[]; error: string | null }> {
  const { data, error } = await client.from(relation).select(column).limit(1000);
  if (error) return { ids: [], error: error.message };
  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  return { ids: rows.map((row) => String(row[column])), error: null };
}

async function countRows(client: SupabaseClient, relation: string): Promise<{ count: number; error: string | null }> {
  const { count, error } = await client.from(relation).select("*", { count: "exact", head: true });
  return { count: count ?? 0, error: error ? error.message : null };
}

async function main(): Promise<void> {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const password = requireEnv("DEMO_USER_PASSWORD");

  // 1. Anonymous access ----------------------------------------------------------
  const anon = newClient(url, anonKey);
  for (const relation of PROTECTED_RELATIONS) {
    const { count, error } = await countRows(anon, relation);
    record(`anon reads nothing from ${relation}`, error !== null || count === 0, error ?? `${count} rows`);
  }
  const anonRpc = await anon.rpc("get_owner_dashboard");
  record("anon cannot call get_owner_dashboard", anonRpc.error !== null, anonRpc.error?.message ?? "call succeeded");

  // 2. Sign in demo accounts --------------------------------------------------------
  const sm1 = await signIn(url, anonKey, "sm1", password);
  const sm2 = await signIn(url, anonKey, "sm2", password);
  const ad1 = await signIn(url, anonKey, "ad1", password);
  const ad2 = await signIn(url, anonKey, "ad2", password);

  // 3. Site manager isolation -------------------------------------------------------
  if (sm1 && sm2) {
    const p1 = await selectIds(sm1, "projects");
    const p2 = await selectIds(sm2, "projects");
    record("SM001 sees at least one project", p1.error === null && p1.ids.length > 0, p1.error ?? `${p1.ids.length} projects`);
    record("SM002 sees at least one project", p2.error === null && p2.ids.length > 0, p2.error ?? `${p2.ids.length} projects`);

    const sm1OwnMemberships = await selectIds(sm1, "project_members", "project_id");
    const sm2OwnMemberships = await selectIds(sm2, "project_members", "project_id");
    const sm2Only = sm2OwnMemberships.ids.filter((id) => !sm1OwnMemberships.ids.includes(id));
    const sm1Only = sm1OwnMemberships.ids.filter((id) => !sm2OwnMemberships.ids.includes(id));

    const leakedToSm1 = p1.ids.filter((id) => sm2Only.includes(id));
    const leakedToSm2 = p2.ids.filter((id) => sm1Only.includes(id));
    record("SM001 cannot read SM002's projects", leakedToSm1.length === 0, `${leakedToSm1.length} leaked`);
    record("SM002 cannot read SM001's projects", leakedToSm2.length === 0, `${leakedToSm2.length} leaked`);

    if (sm2Only.length > 0) {
      const direct = await sm1.from("projects").select("id").in("id", sm2Only);
      record(
        "SM001 direct lookup of SM002 project ids returns nothing",
        direct.error !== null || (direct.data ?? []).length === 0,
        direct.error?.message ?? `${(direct.data ?? []).length} rows`,
      );
      const requests = await sm1.from("material_requests").select("id").in("project_id", sm2Only);
      record(
        "SM001 cannot read SM002's material requests",
        requests.error !== null || (requests.data ?? []).length === 0,
        requests.error?.message ?? `${(requests.data ?? []).length} rows`,
      );
      const updates = await sm1.from("project_updates").select("id").in("project_id", sm2Only);
      record(
        "SM001 cannot read SM002's project updates",
        updates.error !== null || (updates.data ?? []).length === 0,
        updates.error?.message ?? `${(updates.data ?? []).length} rows`,
      );
    }

    for (const [label, client] of [
      ["SM001", sm1],
      ["SM002", sm2],
    ] as const) {
      const fin = await countRows(client, "project_financials");
      record(`${label} cannot read project_financials`, fin.error !== null || fin.count === 0, fin.error ?? `${fin.count} rows`);
      const dash = await client.rpc("get_owner_dashboard");
      record(`${label} cannot call get_owner_dashboard`, dash.error !== null, dash.error?.message ?? "call succeeded");
      const perf = await client.rpc("get_admin_performance");
      record(`${label} cannot call get_admin_performance`, perf.error !== null, perf.error?.message ?? "call succeeded");
    }
  }

  // 4. Admin isolation -----------------------------------------------------------------
  for (const [label, client, otherKey] of [
    ["AD001", ad1, "ad2"],
    ["AD002", ad2, "ad1"],
  ] as const) {
    if (!client) continue;
    for (const relation of ["clients", "client_directory", "project_financials", "project_financial_summary"] as const) {
      const res = await countRows(client, relation);
      record(`${label} cannot read ${relation}`, res.error !== null || res.count === 0, res.error ?? `${res.count} rows`);
    }

    const { data: me } = await client.auth.getUser();
    const other = otherKey === "ad1" ? ad1 : ad2;
    const otherUser = other ? (await other.auth.getUser()).data.user : null;
    if (me.user && otherUser) {
      const foreign = await client.from("material_requests").select("id, project_id").eq("assigned_admin", otherUser.id);
      const foreignRows = (foreign.data ?? []) as Array<{ id: string; project_id: string }>;
      // Rows are only acceptable if this admin is an explicit member of the project.
      const memberships = await selectIds(client, "project_members", "project_id");
      const leaked = foreignRows.filter((row) => !memberships.ids.includes(row.project_id));
      record(
        `${label} cannot read requests assigned to the other admin`,
        foreign.error !== null || leaked.length === 0,
        foreign.error?.message ?? `${leaked.length} leaked`,
      );
    }

    const columns = await client.from("project_directory").select("*").limit(1);
    const keys = Object.keys(((columns.data ?? [])[0] ?? {}) as Record<string, unknown>);
    record(
      `${label} project_directory has no cost columns`,
      !keys.some((k) => k.includes("cost") || k.includes("advance")),
      keys.length === 0 ? "no rows visible" : `${keys.length} columns`,
    );
  }

  for (const client of [sm1, sm2, ad1, ad2]) {
    if (client) await client.auth.signOut();
  }

  // Report -------------------------------------------------------------------------------
  const width = Math.max(...results.map((r) => r.check.length), 10);
  console.log(`\n${"Check".padEnd(width)}  Result  Detail`);
  console.log(`${"-".repeat(width)}  ------  ${"-".repeat(30)}`);
  for (const r of results) {
    console.log(`${r.check.padEnd(width)}  ${r.pass ? "PASS  " : "FAIL  "}  ${r.detail}`);
  }
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed.`);
  if (failed > 0) process.exit(1);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`verify-rls failed: ${message}`);
  process.exit(1);
});
