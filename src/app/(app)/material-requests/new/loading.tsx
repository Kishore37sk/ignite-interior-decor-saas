import { Skeleton } from "@/components/ui/skeleton";

export default function NewMaterialRequestLoading() {
  return (
    <div role="status" aria-busy="true" className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <span className="sr-only">Loading form…</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-64" />
      </div>
      {[0, 1].map((card) => (
        <div key={card} className="card-surface flex flex-col gap-4 p-5 sm:p-6">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-12 w-full" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      ))}
      <Skeleton className="h-16 w-full rounded-2xl" />
    </div>
  );
}
