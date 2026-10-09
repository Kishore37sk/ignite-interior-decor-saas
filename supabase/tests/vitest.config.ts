import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  root,
  test: {
    environment: "node",
    root,
    include: ["supabase/tests/**/*.test.ts"],
    // Each test file boots its own in-memory Postgres (PGlite) and applies all migrations.
    testTimeout: 120_000,
    hookTimeout: 300_000,
    pool: "forks",
    // Business dates are Asia/Kolkata; run under another zone to catch timezone leaks.
    env: { TZ: "America/New_York" },
  },
});
