import "server-only";
import { toFriendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export type TeamCounts = {
  total: number;
  activeSiteManagers: number;
  activeAdmins: number;
  inactive: number;
};

/** Head-only counts for the /users summary cards (owner RLS sees every profile). */
export async function getTeamCounts(): Promise<TeamCounts> {
  const supabase = await createClient();
  const base = () => supabase.from("profiles").select("id", { count: "exact", head: true });
  const [total, sms, admins, inactive] = await Promise.all([
    base(),
    base().eq("role", "site_manager").eq("status", "active"),
    base().eq("role", "admin").eq("status", "active"),
    base().eq("status", "inactive"),
  ]);
  const error = total.error ?? sms.error ?? admins.error ?? inactive.error;
  if (error) throw new Error(toFriendlyError(error, "We couldn't load team counts.", "users.counts"));
  return {
    total: total.count ?? 0,
    activeSiteManagers: sms.count ?? 0,
    activeAdmins: admins.count ?? 0,
    inactive: inactive.count ?? 0,
  };
}
