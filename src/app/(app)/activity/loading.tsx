import { Skeleton } from "@/components/ui/skeleton";

export default function ActivityLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Loading activity…</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="card-surface flex flex-col gap-5 p-4 sm:p-6">
        <div className="flex flex-col gap-2 lg:flex-row">
          <Skeleton className="h-11 w-full lg:max-w-xs" />
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Skeleton className="h-11 sm:w-44" />
            <Skeleton className="h-11 sm:w-44" />
            <Skeleton className="h-11 sm:w-44" />
          </div>
        </div>
        <Skeleton className="h-3 w-24" />
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="flex gap-3">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-4 w-full max-w-xl" />
              <Skeleton className="h-5 w-28 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
