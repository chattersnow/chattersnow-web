import {
  PageHeaderSkeleton,
  StatCardsSkeleton,
  TableCardSkeleton,
  ToolbarSkeleton,
} from "@/components/portal/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Its own, rather than the event detail skeleton above it: that one draws a
 * section rail and a card grid this page does not have.
 */
export default function EventRegistrantsLoading() {
  return (
    <>
      <Skeleton className="mb-3 h-5 w-64" />
      <PageHeaderSkeleton />
      <StatCardsSkeleton className="mt-5" />
      <ToolbarSkeleton />
      <TableCardSkeleton columns={6} rows={8} className="mt-3" />
    </>
  );
}
