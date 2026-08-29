import { Skeleton } from "@/components/ui/skeleton";

export default function MissionLoading() {
  return (
    <div className="space-y-12">
      <section className="grid gap-8 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <div className="rainbow-accent mb-4 w-16" />
          <Skeleton className="h-10 w-56 sm:h-12" />
          <div className="mt-4 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
          <div className="mt-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full max-w-md" />
            ))}
          </div>
          <Skeleton className="mt-4 h-4 w-3/4" />
        </div>
        <Skeleton className="aspect-square w-full rounded-2xl" />
      </section>

      <section>
        <Skeleton className="h-8 w-36 sm:h-9" />
        <div className="mt-4 max-w-3xl space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </section>

      <section>
        <Skeleton className="h-8 w-64 sm:h-9" />
        <div className="mt-4 max-w-3xl space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </section>

      <Skeleton className="aspect-[16/9] w-full rounded-2xl" />
    </div>
  );
}
