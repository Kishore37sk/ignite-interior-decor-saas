/**
 * Creates (or promotes) the Ignite Interior Decor owner account.
 *
 *   npm run bootstrap:owner                    # create owner or ensure role
 *   npm run bootstrap:owner -- --reset-password # also set OWNER_PASSWORD on an existing user
 *
 * Reads .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * OWNER_EMAIL, OWNER_PASSWORD (min 10 chars), OWNER_NAME.
 * The password is never printed or logged.
 */
import { config } from "dotenv";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const MIN_PASSWORD_LENGTH = 10;

class ConfigError extends Error {}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new ConfigError(`Missing ${name}. Set it in .env.local.`);
  return value;
}

async function findUserByEmail(admin: SupabaseClient, email: string): Promise<User | null> {
  const perPage = 1000;
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Could not list users: ${error.message}`);
    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match) return match;
    if (data.users.length < perPage) return null;
  }
  return null;
}

async function main(): Promise<void> {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const email = requireEnv("OWNER_EMAIL").toLowerCase();
  const password = requireEnv("OWNER_PASSWORD");
  const fullName = requireEnv("OWNER_NAME");
  const resetPassword = process.argv.includes("--reset-password");

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new ConfigError("OWNER_EMAIL is not a valid email address.");
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ConfigError(`OWNER_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  let user = await findUserByEmail(admin, email);

  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: "owner" },
      user_metadata: { full_name: fullName },
    });
    if (error || !data.user) throw new Error(`Could not create the owner user: ${error?.message ?? "unknown error"}`);
    user = data.user;
    console.log(`Created owner auth user ${email}.`);
  } else {
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      app_metadata: { ...(user.app_metadata ?? {}), role: "owner" },
      user_metadata: { ...(user.user_metadata ?? {}), full_name: fullName },
      email_confirm: true,
      ...(resetPassword ? { password } : {}),
    });
    if (error) throw new Error(`Could not update the existing user: ${error.message}`);
    console.log(
      `Existing user ${email} found; role set to owner${resetPassword ? " and password reset" : " (password unchanged; pass --reset-password to change it)"}.`,
    );
  }

  // The handle_new_user trigger normally creates the profile; upsert covers users
  // that existed before the schema was installed. The service role bypasses RLS
  // and the protect_profile_fields trigger.
  const { error: profileError } = await admin
    .from("profiles")
    .upsert(
      { id: user.id, email, full_name: fullName, role: "owner", status: "active" },
      { onConflict: "id" },
    );
  if (profileError) {
    throw new Error(
      `Could not update the owner profile (have the migrations in supabase/setup.sql been applied?): ${profileError.message}`,
    );
  }

  const { data: profile, error: readError } = await admin
    .from("profiles")
    .select("id, email, role, status")
    .eq("id", user.id)
    .single<{ id: string; email: string; role: string | null; status: string }>();
  if (readError || !profile) throw new Error(`Could not verify the owner profile: ${readError?.message ?? "not found"}`);
  if (profile.role !== "owner" || profile.status !== "active") {
    throw new Error(`Owner profile verification failed (role=${profile.role}, status=${profile.status}).`);
  }

  console.log(`Owner ready: ${profile.email} (profile ${profile.id}, role ${profile.role}, ${profile.status}).`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`bootstrap-owner failed: ${message}`);
  process.exit(1);
});
