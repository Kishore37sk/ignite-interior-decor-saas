"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { SITE_MANAGER_BOTTOM_NAV, isNavActive } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/types/database";
import { BrandLogo } from "./brand-logo";
import { NavIcon } from "./nav-icons";
import { SidebarCard, SidebarNav } from "./sidebar";

type MobileDrawerProps = { role: AppRole; companyName: string; logoUrl?: string | null; fullName: string };

/** Hamburger + slide-over navigation drawer (below `lg`). */
export function MobileDrawer({ role, companyName, logoUrl = null, fullName }: MobileDrawerProps) {
  const [open, setOpen] = useState(false);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        className="inline-flex size-11 items-center justify-center rounded-xl border border-border-soft bg-white text-text transition-colors hover:bg-soft/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:hidden"
        aria-label="Open navigation menu"
      >
        <Menu className="size-5" aria-hidden="true" />
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay/40 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          className="fixed inset-y-0 left-0 z-50 flex w-[86vw] max-w-[300px] flex-col bg-white shadow-2xl outline-none"
          aria-describedby={undefined}
        >
          <div className="flex items-center justify-between px-5 pb-4 pt-5">
            <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
            <BrandLogo logoUrl={logoUrl} name={companyName} />
            <DialogPrimitive.Close
              className="inline-flex size-10 items-center justify-center rounded-xl text-muted hover:bg-soft/60 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Close navigation menu"
            >
              <X className="size-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-4">
            <SidebarNav role={role} onNavigate={() => setOpen(false)} />
          </div>
          <div className="p-4">
            <SidebarCard companyName={companyName} role={role} fullName={fullName} />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Fixed bottom navigation for site managers on small screens (app.md §59). */
export function SiteManagerBottomNav() {
  const pathname = usePathname();
  const hrefs = SITE_MANAGER_BOTTOM_NAV.map((item) => item.href);

  return (
    <nav
      aria-label="Quick navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border-soft bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5 items-end px-2">
        {SITE_MANAGER_BOTTOM_NAV.map((item) => {
          const active = isNavActive(pathname, item.href, hrefs);
          if (item.prominent) {
            return (
              <li key={item.href} className="flex justify-center">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className="-mt-5 flex flex-col items-center gap-1 rounded-2xl pb-2 text-[11px] font-semibold text-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/40 ring-4 ring-white transition-colors hover:bg-primary-hover">
                    <NavIcon name={item.icon} className="size-6" />
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          }
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl py-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  active ? "text-deep" : "text-muted hover:text-text",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                    active && "bg-soft",
                  )}
                >
                  <NavIcon name={item.icon} className="size-5" />
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
