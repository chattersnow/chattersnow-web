import { Skeleton } from "@/components/ui/skeleton";
import {
  FieldCardSkeleton,
  PageHeaderSkeleton,
} from "@/components/portal/page-skeleton";

/**
 * The rail's column and the first card or two, so the page does not jump from
 * one column to two once the data lands.
 */
export default function PermissionReferenceLoading() {
  return (
    <>
      <PageHeaderSkeleton action={false} />
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-7 w-full" />
          ))}
        </div>
        <div className="space-y-6">
          <FieldCardSkeleton rows={4} />
          <FieldCardSkeleton rows={4} />
        </div>
      </div>
    </>
  );
}
