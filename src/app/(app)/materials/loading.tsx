import { CardGridSkeleton } from "@/components/shared/loading-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function MaterialsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2" aria-hidden="true">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="flex gap-3" aria-hidden="true">
        <Skeleton className="h-9 w-32 rounded-full" />
        <Skeleton className="h-9 w-28 rounded-full" />
      </div>
      <CardGridSkeleton count={4} />
    </div>
  );
}
