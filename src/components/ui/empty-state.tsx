import { Inbox, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type EmptyStateProps = {
  title: string;
  description?: ReactNode;
  /** Lucide icon component (default: Inbox). */
  icon?: LucideIcon;
  /** Primary call to action (e.g. a `<Button asChild><Link/></Button>`). */
  action?: ReactNode;
  /** Compact padding for use inside cards/tabs. */
  compact?: boolean;
  className?: string;
};

export function EmptyState({ title, description, icon: Icon = Inbox, action, compact = false, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-2 px-4 py-8" : "gap-3 px-6 py-14",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mb-1 inline-flex items-center justify-center rounded-2xl bg-soft text-deep",
          compact ? "size-12" : "size-14",
        )}
      >
        <Icon className={compact ? "size-5" : "size-6"} />
      </span>
      <h3 className="text-base font-semibold text-text">{title}</h3>
      {description ? <p className="max-w-sm text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  );
}
