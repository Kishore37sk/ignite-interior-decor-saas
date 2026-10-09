import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function LoadingRegion({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={cn("min-w-0", className)}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export type TableSkeletonProps = {
  rows?: number;
  columns?: number;
  /** Include the toolbar (search + filters) placeholder. */
  toolbar?: boolean;
  className?: string;
};

/** List page placeholder: toolbar, grey header row, rows (cards on mobile). */
export function TableSkeleton({ rows = 8, columns = 5, toolbar = true, className }: TableSkeletonProps) {
  return (
    <LoadingRegion label="Loading list…" className={cn("card-surface flex flex-col gap-4 p-4 sm:p-5", className)}>
      {toolbar ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Skeleton className="h-11 w-full sm:max-w-xs" />
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Skeleton className="h-11 sm:w-40" />
            <Skeleton className="h-11 sm:w-40" />
          </div>
        </div>
      ) : null}
      <div className="hidden md:block">
        <Skeleton className="h-11 w-full rounded-xl" />
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="flex items-center gap-6 border-b border-border-soft px-4 py-4 last:border-b-0">
            <div className="flex w-1/4 items-center gap-3">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
            {Array.from({ length: Math.max(0, columns - 1) }, (_, col) => (
              <Skeleton key={col} className={cn("h-3.5 flex-1", col === columns - 2 && "h-6 max-w-24 rounded-full")} />
            ))}
          </div>
        ))}
      </div>
      <div className="flex flex-col divide-y divide-border-soft md:hidden">
        {Array.from({ length: Math.min(rows, 5) }, (_, row) => (
          <div key={row} className="flex flex-col gap-3 py-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

export type CardGridSkeletonProps = {
  count?: number;
  className?: string;
};

/** Grid of card placeholders (project/client/request cards). */
export function CardGridSkeleton({ count = 6, className }: CardGridSkeletonProps) {
  return (
    <LoadingRegion label="Loading…" className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3", className)}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="card-surface flex flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-6 w-32 rounded-full" />
          <div className="grid grid-cols-2 gap-3 border-t border-border-soft pt-4">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        </div>
      ))}
    </LoadingRegion>
  );
}

function StatCardSkeleton() {
  return (
    <div className="card-surface flex flex-col overflow-hidden">
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="size-10 rounded-xl" />
        </div>
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="bg-soft/60 px-5 py-3">
        <Skeleton className="h-3 w-3/4 bg-soft-strong/70" />
      </div>
    </div>
  );
}

/** Dashboard placeholder: KPI row, two charts, list panel. */
export function DashboardSkeleton({ stats = 4, className }: { stats?: number; className?: string }) {
  return (
    <LoadingRegion label="Loading dashboard…" className={cn("flex flex-col gap-6", className)}>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-56" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: stats }, (_, index) => (
          <StatCardSkeleton key={index} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card-surface flex flex-col gap-4 p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-9 w-28 rounded-xl" />
          </div>
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
        <div className="card-surface flex flex-col items-center gap-4 p-6">
          <Skeleton className="h-5 w-32 self-start" />
          <Skeleton className="size-44 rounded-full" />
          <div className="flex w-full flex-col gap-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        </div>
      </div>
      <TableSkeleton rows={5} toolbar={false} />
    </LoadingRegion>
  );
}

/** Detail page placeholder: header, tabs, info grid and side panel. */
export function DetailSkeleton({ className }: { className?: string }) {
  return (
    <LoadingRegion label="Loading details…" className={cn("flex flex-col gap-6", className)}>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-24" />
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-8 w-64 max-w-full" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="flex gap-4 overflow-hidden border-b border-border-soft pb-3">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-5 w-20 shrink-0" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card-surface flex flex-col gap-5 p-6 lg:col-span-2">
          <Skeleton className="h-5 w-40" />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="flex flex-col gap-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ))}
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
        <div className="card-surface flex flex-col gap-4 p-6">
          <Skeleton className="h-5 w-32" />
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="flex items-center gap-3">
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}
