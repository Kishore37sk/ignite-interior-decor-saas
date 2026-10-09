import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Loading settings…</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <div className="card-surface flex flex-col gap-4 p-6">
            <Skeleton className="h-5 w-32" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-11" />
              ))}
            </div>
          </div>
          <Skeleton className="h-80 rounded-2xl" />
        </div>
        <div className="flex flex-col gap-6">
          <Skeleton className="h-96 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
