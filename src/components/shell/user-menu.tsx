"use client";

import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { ChevronDown, LogOut, Settings, UserRound } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { ROLE_LABELS } from "@/lib/constants";
import { ShellAvatar } from "./shell-avatar";
import type { ShellUser } from "./types";

const itemClass =
  "flex min-h-10 cursor-pointer select-none items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text outline-none transition-colors data-[highlighted]:bg-soft/60 data-[disabled]:pointer-events-none data-[disabled]:opacity-50";

/** Avatar + name + role trigger with profile / settings / sign-out menu. */
export function UserMenu({ user }: { user: ShellUser }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [signingOut, setSigningOut] = useState(false);
  const roleLabel = ROLE_LABELS[user.role];

  return (
    <>
      {/* Sign-out is a POST so it can't be triggered by a link prefetch or cross-site GET. */}
      <form ref={formRef} action="/auth/signout" method="post" className="hidden" aria-hidden="true" />
      <DropdownMenuPrimitive.Root>
        <DropdownMenuPrimitive.Trigger
          className="flex items-center gap-3 rounded-xl p-1 pr-2 text-left transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary data-[state=open]:bg-white"
          aria-label={`Account menu for ${user.fullName}`}
        >
          <ShellAvatar name={user.fullName} src={user.avatarUrl} />
          <span className="hidden min-w-0 sm:block">
            <span className="block max-w-[160px] truncate text-[15px] font-semibold leading-tight text-text">
              {user.fullName}
            </span>
            <span className="block text-xs text-muted">{roleLabel}</span>
          </span>
          <ChevronDown className="hidden size-4 text-muted sm:block" aria-hidden="true" />
        </DropdownMenuPrimitive.Trigger>
        <DropdownMenuPrimitive.Portal>
          <DropdownMenuPrimitive.Content
            align="end"
            sideOffset={10}
            collisionPadding={12}
            className="z-50 w-64 rounded-2xl border border-border-soft bg-white p-2 shadow-pop"
          >
            <div className="flex items-center gap-3 px-3 py-2.5">
              <ShellAvatar name={user.fullName} src={user.avatarUrl} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-text">{user.fullName}</p>
                <p className="truncate text-xs text-muted">{user.email}</p>
              </div>
            </div>
            <div className="mx-3 mb-1 flex items-center gap-2 text-xs text-muted">
              <span className="rounded-full bg-soft px-2 py-0.5 font-medium text-deep">{roleLabel}</span>
              {user.employeeId ? <span>ID {user.employeeId}</span> : null}
            </div>
            <DropdownMenuPrimitive.Separator className="my-1.5 h-px bg-border-soft" />
            <DropdownMenuPrimitive.Item asChild className={itemClass}>
              <Link href="/profile">
                <UserRound className="size-4 text-muted" aria-hidden="true" />
                My profile
              </Link>
            </DropdownMenuPrimitive.Item>
            {user.role === "owner" ? (
              <DropdownMenuPrimitive.Item asChild className={itemClass}>
                <Link href="/settings">
                  <Settings className="size-4 text-muted" aria-hidden="true" />
                  Settings
                </Link>
              </DropdownMenuPrimitive.Item>
            ) : null}
            <DropdownMenuPrimitive.Separator className="my-1.5 h-px bg-border-soft" />
            <DropdownMenuPrimitive.Item
              className={`${itemClass} text-danger-text data-[highlighted]:bg-danger-bg`}
              disabled={signingOut}
              onSelect={() => {
                setSigningOut(true);
                formRef.current?.requestSubmit();
              }}
            >
              <LogOut className="size-4" aria-hidden="true" />
              {signingOut ? "Signing out…" : "Sign out"}
            </DropdownMenuPrimitive.Item>
          </DropdownMenuPrimitive.Content>
        </DropdownMenuPrimitive.Portal>
      </DropdownMenuPrimitive.Root>
    </>
  );
}
