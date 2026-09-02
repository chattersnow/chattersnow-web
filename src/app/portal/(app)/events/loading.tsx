import { TableCardSkeleton } from "@/components/portal/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function EventsLoading() {
  return (
    <>
      <div className="w-fit">
        <Skeleton className="h-10 w-48" />
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-[var(--line)] p-4">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-28" />
      </div>

      <TableCardSkeleton columns={5} />
    </>
  );
}
