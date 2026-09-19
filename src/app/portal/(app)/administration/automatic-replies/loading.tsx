import { Skeleton } from "@/components/ui/skeleton";
import {
  FieldCardSkeleton,
  PageHeaderSkeleton,
} from "@/components/portal/page-skeleton";

export default function AutomaticRepliesLoading() {
  return (
    <>
      <PageHeaderSkeleton action={false} />
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-7 w-full" />
          ))}
        </div>
        <FieldCardSkeleton rows={5} />
      </div>
    </>
  );
}
