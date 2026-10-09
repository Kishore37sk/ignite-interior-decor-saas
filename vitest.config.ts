import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws outside a React Server Component bundle; unit tests run in Node.
      "server-only": fileURLToPath(new URL("./src/lib/testing/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules/**", "supabase/**", "e2e/**", ".next/**"],
    // Business logic is IST-based; run tests under a different zone to catch leaks.
    env: { TZ: "America/New_York" },
    restoreMocks: true,
  },
});
