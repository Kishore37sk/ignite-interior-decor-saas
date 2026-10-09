/**
 * PGlite-based test harness for the Ignite Interior Decor database.
 *
 * Boots a real Postgres (WASM), installs a minimal Supabase stub (API roles,
 * auth schema with auth.uid()/auth.role()/auth.jwt(), storage schema, the
 * supabase_realtime publication and Supabase's permissive default privileges),
 * then applies every migration in supabase/migrations in order. Because the
 * stub reproduces Supabase's default "grant all to anon/authenticated", the
 * tests prove that the migrations themselves lock everything down.
 */
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

export type AppRole = "owner" | "admin" | "site_manager";
export type Db = PGlite | Transaction;
export type SqlParam = string | number | boolean | null;
export type RpcArg = SqlParam | readonly unknown[] | Record<string, unknown> | undefined;

export interface TestUser {
  id: string;
  email: string;
  name: string;
  role: AppRole | null;
}

export interface CreateUserOptions {
  email?: string;
  employeeId?: string;
  status?: "active" | "inactive";
  phone?: string;
}

export interface CreateClientOptions {
  email?: string | null;
  city?: string;
  archived?: boolean;
}

export interface CreateProjectOptions {
  name?: string;
  status?: string;
  progress?: number;
  startOffset?: number | null;
  deadlineOffset?: number | null;
  handoverOffset?: number | null;
  actualHandoverOffset?: number | null;
  archived?: boolean;
  cost?: number;
}

export const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations/", import.meta.url));

const SUPABASE_STUB_SQL = String.raw`
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;

create schema auth;
create table auth.users (
  id uuid primary key,
  email text unique,
  email_change text default '',
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function auth.uid() returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create function auth.role() returns text
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

create function auth.jwt() returns jsonb
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

create schema storage;
create table storage.buckets (
  id text primary key,
  name text not null unique,
  owner uuid,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;

create function storage.foldername(name text) returns text[]
language plpgsql immutable
as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end
$$;

grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.buckets, storage.objects to anon, authenticated, service_role;
grant execute on all functions in schema storage to anon, authenticated, service_role;

create publication supabase_realtime;

-- Supabase grants everything in "public" to the API roles by default.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export function listMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort();
}

function toParam(value: RpcArg): SqlParam {
  if (value === undefined || value === null) return null;
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

/** A booted database with the full schema applied plus test helpers. */
export class TestDatabase {
  private constructor(readonly db: PGlite) {}

  /**
   * Boots Postgres with the Supabase stub, then applies either every migration
   * (default) or the given bundled SQL (used to verify supabase/setup.sql).
   */
  static async create(options: { setupSql?: string } = {}): Promise<TestDatabase> {
    const db = await PGlite.create({ extensions: { pg_trgm } });
    await db.exec(SUPABASE_STUB_SQL);
    if (options.setupSql !== undefined) {
      await db.exec(options.setupSql);
      return new TestDatabase(db);
    }
    for (const file of listMigrationFiles()) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      try {
        await db.exec(sql);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Migration ${file} failed: ${message}`);
      }
    }
    return new TestDatabase(db);
  }

  async close(): Promise<void> {
    await this.db.close();
  }

  /** Run as the database owner (postgres, bypasses RLS). */
  async sql<T = Record<string, unknown>>(text: string, params: SqlParam[] = []): Promise<T[]> {
    const result = await this.db.query<T>(text, params);
    return result.rows;
  }

  async one<T = Record<string, unknown>>(text: string, params: SqlParam[] = []): Promise<T> {
    const rows = await this.sql<T>(text, params);
    const row = rows[0];
    if (row === undefined) throw new Error(`Expected one row from: ${text}`);
    return row;
  }

  /** Run fn inside a transaction as an authenticated user (JWT sub = userId). */
  async asUser<T>(userId: string, fn: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: userId, role: "authenticated", aud: "authenticated" }),
      ]);
      await tx.exec("set local role authenticated");
      return fn(tx);
    });
  }

  /** Run fn inside a transaction as the anonymous API role. */
  async asAnon<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
      await tx.exec("set local role anon");
      return fn(tx);
    });
  }

  /** Run fn inside a transaction as the service role (bypasses RLS like Supabase). */
  async asService<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role" })]);
      await tx.exec("set local role service_role");
      return fn(tx);
    });
  }

  /** Creates an auth user; the handle_new_user trigger creates the profile. */
  async createUser(role: AppRole | null, name: string, opts: CreateUserOptions = {}): Promise<TestUser> {
    const id = randomUUID();
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");
    const email = opts.email ?? `${slug}.${id.slice(0, 8)}@test.igniteinteriordecor.com`;
    const appMeta: Record<string, string> = {};
    if (role) appMeta.role = role;
    if (opts.employeeId) appMeta.employee_id = opts.employeeId;
    const userMeta: Record<string, string> = { full_name: name };
    if (opts.phone) userMeta.phone = opts.phone;

    await this.db.query(
      "insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values ($1, $2, $3, $4)",
      [id, email, JSON.stringify(appMeta), JSON.stringify(userMeta)],
    );
    if (opts.status === "inactive") {
      await this.db.query("update public.profiles set status = 'inactive' where id = $1", [id]);
    }
    return { id, email: email.toLowerCase(), name, role };
  }

  async createClient(name: string, opts: CreateClientOptions = {}): Promise<string> {
    const row = await this.one<{ id: string }>(
      `insert into public.clients (name, email, city, archived_at)
       values ($1, $2, $3, case when $4::boolean then now() end)
       returning id`,
      [name, opts.email === undefined ? null : opts.email, opts.city ?? "Bengaluru", opts.archived ?? false],
    );
    return row.id;
  }

  /** Dates are offsets in days from app_today() (Asia/Kolkata). */
  async createProject(clientId: string, opts: CreateProjectOptions = {}): Promise<string> {
    const row = await this.one<{ id: string }>(
      `insert into public.projects (client_id, name, status, progress_percentage, start_date,
                                    expected_completion_date, handover_date, actual_handover_date, archived_at)
       values ($1, $2, $3::public.project_status, $4,
               public.app_today() + $5::int, public.app_today() + $6::int, public.app_today() + $7::int,
               public.app_today() + $8::int, case when $9::boolean then now() end)
       returning id`,
      [
        clientId,
        opts.name ?? `Project ${randomUUID().slice(0, 6)}`,
        opts.status ?? "execution",
        opts.progress ?? 0,
        opts.startOffset === undefined ? -60 : opts.startOffset,
        opts.deadlineOffset === undefined ? 60 : opts.deadlineOffset,
        opts.handoverOffset === undefined ? null : opts.handoverOffset,
        opts.actualHandoverOffset === undefined ? null : opts.actualHandoverOffset,
        opts.archived ?? false,
      ],
    );
    if (opts.cost !== undefined) {
      await this.db.query("update public.project_financials set project_cost = $2 where project_id = $1", [
        row.id,
        opts.cost,
      ]);
    }
    return row.id;
  }

  async addMember(
    projectId: string,
    userId: string,
    memberRole: "site_manager" | "admin",
    canViewFinancials = false,
  ): Promise<string> {
    const row = await this.one<{ id: string }>(
      `insert into public.project_members (project_id, user_id, member_role, can_view_financials)
       values ($1, $2, $3::public.member_role, $4) returning id`,
      [projectId, userId, memberRole, canViewFinancials],
    );
    return row.id;
  }

  async today(): Promise<string> {
    const row = await this.one<{ d: string }>("select public.app_today()::text as d");
    return row.d;
  }

  async dateOffset(days: number): Promise<string> {
    const row = await this.one<{ d: string }>("select (public.app_today() + $1::int)::text as d", [days]);
    return row.d;
  }
}

/** Calls public.<fn>(name => value, ...) and returns the rows. */
export async function rpc<T = Record<string, unknown>>(
  tx: Db,
  fn: string,
  args: Record<string, RpcArg> = {},
): Promise<T[]> {
  if (!/^[a-z_][a-z0-9_]*$/.test(fn)) throw new Error(`Invalid function name: ${fn}`);
  const entries = Object.entries(args).filter(([, value]) => value !== undefined);
  for (const [name] of entries) {
    if (!/^p_[a-z0-9_]+$/.test(name)) throw new Error(`Invalid argument name: ${name}`);
  }
  const placeholders = entries.map(([name], index) => `${name} => $${index + 1}`).join(", ");
  const params = entries.map(([, value]) => toParam(value));
  const result = await tx.query<T>(`select * from public.${fn}(${placeholders})`, params);
  return result.rows;
}

/** Calls an RPC that returns a scalar and returns that value. */
export async function rpcScalar<T>(tx: Db, fn: string, args: Record<string, RpcArg> = {}): Promise<T> {
  const rows = await rpc<Record<string, T>>(tx, fn, args);
  const row = rows[0];
  if (row === undefined) throw new Error(`${fn} returned no rows`);
  const value = Object.values(row)[0];
  return value as T;
}

export async function count(tx: Db, relation: string, where = "true", params: SqlParam[] = []): Promise<number> {
  if (!/^[a-z_][a-z0-9_.]*$/.test(relation)) throw new Error(`Invalid relation: ${relation}`);
  const result = await tx.query<{ n: number }>(`select count(*)::int as n from ${relation} where ${where}`, params);
  return result.rows[0]?.n ?? 0;
}

export const num = (value: unknown): number => (value === null || value === undefined ? Number.NaN : Number(value));
