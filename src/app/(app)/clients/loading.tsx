import { TableSkeleton } from "@/components/shared/loading-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function ClientsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2" aria-hidden="true">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <TableSkeleton rows={8} columns={7} />
    </div>
  );
}
