import { FieldCardSkeleton } from "@/components/portal/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function EventDetailLoading() {
  return (
    <>
      <Skeleton className="mb-2 h-5 w-24" />
      <div className="w-fit">
        <Skeleton className="h-10 w-64" />
        <div className="rainbow-accent mt-3 w-full" />
      </div>
      <div className="mt-3 flex gap-2">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>

      <div className="mt-6 flex gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-6 w-20" />
        ))}
      </div>

      <div className="mt-4 grid items-start gap-6 lg:grid-cols-2">
        <FieldCardSkeleton rows={4} />
      </div>
    </>
  );
}
