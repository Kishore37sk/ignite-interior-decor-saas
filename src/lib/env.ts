/**
 * Typed access to public environment variables.
 *
 * `process.env.NEXT_PUBLIC_*` must be referenced literally so Next.js can inline the
 * values into the browser bundle — do not refactor these into dynamic lookups.
 * The service-role key is deliberately NOT exposed here (see `lib/supabase/admin.ts`).
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and set it.`,
    );
  }
  return value.trim();
}

export function getSupabaseUrl(): string {
  return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function getSupabaseAnonKey(): string {
  return required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** Public site origin without a trailing slash, e.g. `https://portal.example.com`. */
export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return raw.trim().replace(/\/+$/, "");
}
