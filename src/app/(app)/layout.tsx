import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import type { ShellNotification } from "@/components/shell/types";
import { requireUser } from "@/lib/auth";
import { BRAND, NOTIFICATION_PANEL_LIMIT } from "@/lib/constants";
import { greetingForTime } from "@/lib/dates";
import { logServerError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

// Every page here is per-user and must never be statically cached.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const supabase = await createClient();

  const [notificationsResult, unreadResult, settingsResult] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, title, message, type, link, read_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(NOTIFICATION_PANEL_LIMIT),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null),
    supabase.from("company_settings").select("company_name, logo_url").eq("id", 1).maybeSingle(),
  ]);

  // The shell must still render if a secondary query fails; log and degrade gracefully.
  if (notificationsResult.error) logServerError("layout.notifications", notificationsResult.error);
  if (unreadResult.error) logServerError("layout.unreadCount", unreadResult.error);
  if (settingsResult.error) logServerError("layout.companySettings", settingsResult.error);

  const notifications: ShellNotification[] = notificationsResult.data ?? [];
  const unreadCount = unreadResult.count ?? notifications.filter((n) => !n.read_at).length;
  const companyName = settingsResult.data?.company_name?.trim() || BRAND.name;
  const companyLogoUrl = settingsResult.data?.logo_url?.trim() || null;

  return (
    <AppShell
      user={{
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        employeeId: user.employeeId,
        avatarUrl: user.avatarUrl,
      }}
      companyName={companyName}
      companyLogoUrl={companyLogoUrl}
      notifications={notifications}
      unreadCount={unreadCount}
      greeting={greetingForTime()}
    >
      {children}
    </AppShell>
  );
}
