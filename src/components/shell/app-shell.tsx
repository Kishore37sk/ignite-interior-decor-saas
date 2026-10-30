import type { ReactNode } from "react";
import { BRAND } from "@/lib/constants";
import { DeveloperCredit } from "@/components/shared/developer-credit";
import { cn } from "@/lib/utils";
import { SiteManagerBottomNav } from "./mobile-nav";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import type { ShellNotification, ShellUser } from "./types";

export type AppShellProps = {
  user: ShellUser;
  companyName: string;
  /** Settings → Company logo; the bundled Ignite logo is used when empty. */
  companyLogoUrl?: string | null;
  notifications: ShellNotification[];
  unreadCount: number;
  greeting: string;
  children: ReactNode;
};

/** Authenticated application frame: sidebar, topbar, content and footer. */
export function AppShell({ user, companyName, companyLogoUrl = null, notifications, unreadCount, greeting, children }: AppShellProps) {
  const isSiteManager = user.role === "site_manager";
  const year = new Date().getFullYear();

  return (
    <div
      className={cn(
        "flex min-h-dvh bg-background text-text",
        // Space reserved by the fixed bottom nav (incl. the raised centre button), so sticky
        // page action bars can sit above it: `bottom-[var(--bottom-nav-offset,0px)]`.
        isSiteManager && "[--bottom-nav-offset:calc(5rem_+_env(safe-area-inset-bottom))] lg:[--bottom-nav-offset:0px]",
      )}
    >
      <a
        href="#main-content"
        className="sr-only z-[100] rounded-lg bg-deep px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <Sidebar role={user.role} companyName={companyName} logoUrl={companyLogoUrl} fullName={user.fullName} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          user={user}
          companyName={companyName}
          companyLogoUrl={companyLogoUrl}
          notifications={notifications}
          unreadCount={unreadCount}
          initialGreeting={greeting}
        />
        <main
          id="main-content"
          tabIndex={-1}
          className={cn(
            "flex-1 px-4 pb-8 pt-4 outline-none sm:px-6 lg:px-8 lg:pt-6",
            isSiteManager && "pb-28 lg:pb-8",
          )}
        >
          {children}
        </main>
        <footer
          className={cn(
            "flex flex-col gap-1 border-t border-border-soft px-4 py-5 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8",
            isSiteManager && "mb-20 lg:mb-0",
          )}
        >
          <p>
            <span className="font-semibold text-text">© {year} {BRAND.name}</span>
          </p>
          <DeveloperCredit />
        </footer>
      </div>
      {isSiteManager ? <SiteManagerBottomNav /> : null}
    </div>
  );
}
