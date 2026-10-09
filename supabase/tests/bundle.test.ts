import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import { listMigrationFiles, MIGRATIONS_DIR, TestDatabase } from "./harness";

const SETUP_SQL = fileURLToPath(new URL("../setup.sql", import.meta.url));

describe("supabase/setup.sql bundle", () => {
  let t: TestDatabase | undefined;

  afterAll(async () => {
    await t?.close();
  });

  it("exists and contains every migration verbatim (run npm run db:bundle after editing migrations)", () => {
    expect(existsSync(SETUP_SQL)).toBe(true);
    const bundle = readFileSync(SETUP_SQL, "utf8").replace(/\r\n/g, "\n");
    for (const file of listMigrationFiles()) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8").replace(/\r\n/g, "\n").trimEnd();
      expect(bundle.includes(sql), `${file} is missing or stale in setup.sql`).toBe(true);
    }
  });

  it("applies cleanly to a fresh Supabase-like database", async () => {
    t = await TestDatabase.create({ setupSql: readFileSync(SETUP_SQL, "utf8") });
    const rows = await t.sql<{ n: number }>("select count(*)::int as n from public.material_categories");
    expect(rows[0]?.n).toBe(10);
  });
});
