import { Skeleton } from "@/components/ui/skeleton";

export default function GearLibraryLoading() {
  return (
    <div>
      <div className="w-fit">
        <div className="rainbow-accent mb-4 w-full" />
        <Skeleton className="h-10 w-64 sm:h-12" />
      </div>
      <Skeleton className="mt-4 h-4 w-full max-w-3xl" />
      <Skeleton className="mt-4 h-8 w-32" />

      <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-xl border border-[var(--line)]"
          >
            <Skeleton className="aspect-square w-full rounded-none" />
            <div className="space-y-2 px-4 py-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
