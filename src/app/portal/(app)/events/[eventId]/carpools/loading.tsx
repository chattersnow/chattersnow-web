import {
  PageHeaderSkeleton,
  TableCardSkeleton,
} from "@/components/portal/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** Cards per car, then the Unassigned table. */
export default function EventCarpoolsLoading() {
  return (
    <>
      <Skeleton className="mb-3 h-5 w-64" />
      <PageHeaderSkeleton />
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
      <TableCardSkeleton columns={4} rows={6} className="mt-5" />
    </>
  );
}
