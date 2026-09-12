import { Skeleton } from "@/components/ui/skeleton";
import {
  FieldCardSkeleton,
  PageHeaderSkeleton,
} from "@/components/portal/page-skeleton";

export default function SystemSettingsLoading() {
  return (
    <>
      <PageHeaderSkeleton action={false} />
      <div className="mt-6 flex gap-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-24" />
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <FieldCardSkeleton rows={4} />
        <FieldCardSkeleton rows={3} />
      </div>
    </>
  );
}
