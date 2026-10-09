import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { RetryButton } from "./retry-button";

/** Inline error card for a dashboard widget whose query failed (the rest of the page still works). */
export function WidgetError({
  title,
  message,
  className,
}: {
  title: string;
  message: string;
  className?: string;
}) {
  return (
    <section
      role="alert"
      aria-label={`${title} failed to load`}
      className={cn("card-surface flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center", className)}
    >
      <span
        aria-hidden="true"
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-danger-bg text-danger"
      >
        <TriangleAlert className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-text">{title}</h2>
        <p className="mt-0.5 text-sm text-muted">{message}</p>
      </div>
      <RetryButton />
    </section>
  );
}

function Region({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={cn("min-w-0", className)}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export function KpiGridSkeleton({ count = 8, className }: { count?: number; className?: string }) {
  return (
    <Region label="Loading figures…" className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="card-surface flex flex-col overflow-hidden">
          <div className="flex flex-col gap-4 p-5">
            <div className="flex items-start justify-between">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="size-10 rounded-xl" />
            </div>
            <Skeleton className="h-8 w-20" />
          </div>
          <div className="bg-soft/60 px-5 py-3">
            <Skeleton className="h-3 w-3/4 bg-soft-strong/70" />
          </div>
        </div>
      ))}
    </Region>
  );
}

export function CardSkeleton({
  label = "Loading…",
  height = 280,
  rows = 0,
  className,
}: {
  label?: string;
  height?: number;
  rows?: number;
  className?: string;
}) {
  return (
    <Region label={label} className={cn("card-surface flex flex-col gap-4 p-5 sm:p-6", className)}>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-8 w-20 rounded-xl" />
      </div>
      {rows > 0 ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: rows }, (_, index) => (
            <div key={index} className="flex items-center gap-3">
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          ))}
        </div>
      ) : (
        <Skeleton className="w-full rounded-xl" style={{ height }} />
      )}
    </Region>
  );
}
