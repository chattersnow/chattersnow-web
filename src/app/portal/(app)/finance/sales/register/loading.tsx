import { Skeleton } from "@/components/ui/skeleton";

/**
 * Not TablePageSkeleton: the register is a tile grid beside a cart, and a
 * table-shaped placeholder would reflow into something else entirely.
 */
export default function SalesRegisterLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-12 w-48" />
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    </div>
  );
}
