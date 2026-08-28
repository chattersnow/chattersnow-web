import { Skeleton } from "@/components/ui/skeleton";

export default function AttendLoading() {
  return (
    <div className="space-y-12">
      <section>
        <div className="rainbow-accent mb-4 w-16" />
        <Skeleton className="h-10 w-48 sm:h-12" />
        <div className="mt-4 max-w-3xl space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </section>

      <section>
        <Skeleton className="h-8 w-28 sm:h-9" />
        <div className="mt-4 max-w-3xl space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <Skeleton className="mt-4 h-9 w-40 rounded-md" />
      </section>

      <section className="grid grid-cols-2 gap-6">
        <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
        <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
      </section>

      <section>
        <Skeleton className="h-8 w-56 sm:h-9" />
        <Skeleton className="mt-4 h-4 w-full max-w-2xl" />
      </section>
    </div>
  );
}
