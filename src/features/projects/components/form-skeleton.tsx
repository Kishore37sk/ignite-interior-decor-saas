import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder for create/edit/update form pages. */
export function FormPageSkeleton({ sections = 2, fields = 6 }: { sections?: number; fields?: number }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Loading form…</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      {Array.from({ length: sections }, (_, section) => (
        <div key={section} className="card-surface flex flex-col gap-5 p-5 sm:p-6">
          <Skeleton className="h-5 w-40" />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {Array.from({ length: fields }, (_, field) => (
              <div key={field} className="flex flex-col gap-2">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-11 w-full rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
