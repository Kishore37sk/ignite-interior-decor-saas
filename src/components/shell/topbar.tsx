"use client";

import { Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { greetingForTime } from "@/lib/dates";
import { firstName } from "@/lib/format";
import { getNavItems, isNavActive } from "@/lib/navigation";
import { GlobalSearch } from "./global-search";
import { MobileDrawer } from "./mobile-nav";
import { NotificationPanel } from "./notification-panel";
import type { ShellNotification, ShellUser } from "./types";
import { UserMenu } from "./user-menu";

type TopbarProps = {
  user: ShellUser;
  companyName: string;
  companyLogoUrl?: string | null;
  notifications: ShellNotification[];
  unreadCount: number;
  /** Greeting computed on the server (IST) so the first paint matches. */
  initialGreeting: string;
};

function usePageTitle(user: ShellUser): string {
  const pathname = usePathname();
  const items = getNavItems(user.role);
  const hrefs = items.map((item) => item.href);
  const match = items.find((item) => isNavActive(pathname, item.href, hrefs));
  if (match) return match.label;
  if (pathname.startsWith("/profile")) return "Profile";
  return "Ignite Interior Decor";
}

export function Topbar({ user, companyName, companyLogoUrl = null, notifications, unreadCount, initialGreeting }: TopbarProps) {
  const pathname = usePathname();
  const isDashboard = pathname === "/dashboard";
  const title = usePageTitle(user);
  const [greeting, setGreeting] = useState(initialGreeting);

  // Keep the greeting correct for long-lived tabs (IST hour based).
  useEffect(() => {
    const update = () => setGreeting(greetingForTime());
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-border-soft/70 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="flex h-[76px] items-center gap-3 px-4 sm:px-6 lg:h-[88px] lg:px-8">
        <MobileDrawer role={user.role} companyName={companyName} logoUrl={companyLogoUrl} fullName={user.fullName} />

        <div className="min-w-0 flex-1">
          {isDashboard ? (
            <>
              <p className="truncate text-sm text-muted">Hello {firstName(user.fullName)}!</p>
              <p className="truncate text-xl font-bold tracking-tight text-text sm:text-2xl">{greeting}</p>
            </>
          ) : (
            <p className="truncate text-lg font-bold tracking-tight text-text sm:text-xl" aria-hidden="true">
              {title}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-3 md:flex-1 md:justify-end">
          <GlobalSearch />
          {user.role === "owner" ? (
            <Link
              href="/settings"
              aria-label="Settings"
              className="hidden size-11 items-center justify-center rounded-xl border border-border-soft bg-white text-text transition-colors hover:bg-soft/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:inline-flex"
            >
              <Settings className="size-5" aria-hidden="true" />
            </Link>
          ) : null}
          <NotificationPanel userId={user.id} notifications={notifications} unreadCount={unreadCount} />
          <UserMenu user={user} />
        </div>
      </div>
    </header>
  );
}
