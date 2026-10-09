import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type InfoListProps = {
  children: ReactNode;
  /** Two columns from `sm` up. */
  columns?: 1 | 2 | 3;
  className?: string;
};

const COLUMNS = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3" } as const;

/** `<dl>` wrapper for `InfoRow`s. */
export function InfoList({ children, columns = 1, className }: InfoListProps) {
  return <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-4", COLUMNS[columns], className)}>{children}</dl>;
}

export type InfoRowProps = {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  /** Shown when `value` is null/undefined/empty string. */
  fallback?: string;
  className?: string;
};

/** Label/value pair (must be inside `InfoList`). Empty values render a muted dash. */
export function InfoRow({ label, value, icon: Icon, fallback = "—", className }: InfoRowProps) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className={cn("flex min-w-0 items-start gap-3", className)}>
      {Icon ? (
        <span
          aria-hidden="true"
          className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-primary-strong"
        >
          <Icon className="size-[18px]" />
        </span>
      ) : null}
      <div className="flex min-w-0 flex-col gap-0.5">
        <dt className="text-xs font-medium text-muted">{label}</dt>
        <dd className={cn("break-words text-sm font-medium", empty ? "text-muted" : "text-text")}>
          {empty ? fallback : value}
        </dd>
      </div>
    </div>
  );
}
