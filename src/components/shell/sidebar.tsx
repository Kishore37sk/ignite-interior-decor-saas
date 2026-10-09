"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ROLE_LABELS } from "@/lib/constants";
import { getNavItems, isNavActive } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/types/database";
import { BrandLogo } from "./brand-logo";
import { NavIcon } from "./nav-icons";

type SidebarNavProps = {
  role: AppRole;
  /** Called after a link is chosen (closes the mobile drawer). */
  onNavigate?: () => void;
};

/** Role-filtered navigation list (shared by the desktop sidebar and mobile drawer). */
export function SidebarNav({ role, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();
  const items = getNavItems(role);
  const hrefs = items.map((item) => item.href);

  return (
    <nav aria-label="Main navigation">
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const active = isNavActive(pathname, item.href, hrefs);
          return (
            <li key={`${item.href}-${item.label}`}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex min-h-11 items-center gap-3 rounded-xl px-4 py-2.5 text-[15px] font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                  active
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/30"
                    : "text-text/80 hover:bg-soft/60 hover:text-deep",
                )}
              >
                <NavIcon
                  name={item.icon}
                  className={cn(
                    "size-5 shrink-0",
                    active ? "text-white" : "text-muted group-hover:text-deep",
                  )}
                />
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

type SidebarCardProps = { companyName: string; role: AppRole; fullName: string };

/** Soft-green footer card: company + signed-in role (TeamHub "Level up" card position). */
export function SidebarCard({ companyName, role, fullName }: SidebarCardProps) {
  return (
    <div className="rounded-2xl bg-soft p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-deep/80">
        Workspace
      </p>
      <p className="mt-1 text-lg font-bold leading-snug text-deep">{companyName}</p>
      <div className="mt-4 flex items-center gap-2 border-t border-soft-strong pt-3">
        <span className="size-2 rounded-full bg-brand" aria-hidden="true" />
        <p className="min-w-0 text-sm text-text/80">
          <span className="block truncate font-medium text-text">{fullName}</span>
          <span className="text-muted">Signed in as {ROLE_LABELS[role]}</span>
        </p>
      </div>
    </div>
  );
}

type SidebarProps = { role: AppRole; companyName: string; logoUrl?: string | null; fullName: string };

/** Desktop sidebar (hidden below `lg`). */
export function Sidebar({ role, companyName, logoUrl = null, fullName }: SidebarProps) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-[264px] shrink-0 flex-col border-r border-border-soft bg-white lg:flex">
      <div className="px-6 pb-6 pt-7">
        <BrandLogo logoUrl={logoUrl} name={companyName} />
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <SidebarNav role={role} />
      </div>
      <div className="p-4">
        <SidebarCard companyName={companyName} role={role} fullName={fullName} />
      </div>
    </aside>
  );
}
