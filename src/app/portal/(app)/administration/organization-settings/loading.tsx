import { Skeleton } from "@/components/ui/skeleton";
import {
  FieldCardSkeleton,
  PageHeaderSkeleton,
} from "@/components/portal/page-skeleton";

/**
 * Shaped like the General tab, where the page opens (#1482): five tab pills,
 * then the Calendar pair and the Vocabulary pair under their group labels.
 */
export default function OrganizationSettingsLoading() {
  return (
    <>
      <PageHeaderSkeleton action={false} />
      <div className="mt-6 flex flex-wrap gap-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-24" />
        ))}
      </div>
      <div className="mt-6 space-y-8">
        <div className="space-y-3">
          <Skeleton className="h-4 w-20" />
          <div className="grid gap-6 lg:grid-cols-2">
            <FieldCardSkeleton rows={1} />
            <FieldCardSkeleton rows={1} />
          </div>
        </div>
        <div className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <div className="grid gap-6 xl:grid-cols-2">
            <FieldCardSkeleton rows={6} />
            <FieldCardSkeleton rows={7} />
          </div>
        </div>
      </div>
    </>
  );
}
