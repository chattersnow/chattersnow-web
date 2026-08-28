import { Skeleton } from "@/components/ui/skeleton";

export default function DonateGearLoading() {
  return (
    <div className="space-y-12">
      <section>
        <Skeleton className="h-10 w-80 sm:h-12" />
        <div className="mt-4 max-w-3xl space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </section>

      <section>
        <Skeleton className="h-8 w-64 sm:h-9" />
        <div className="mt-4 max-w-3xl space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <Skeleton className="mt-4 h-9 w-32 rounded-md" />
      </section>

      <section>
        <Skeleton className="h-8 w-40 sm:h-9" />
        <div className="mt-6 grid gap-6 sm:grid-cols-3">
          <Skeleton className="aspect-square w-full rounded-xl" />
          <div className="space-y-3 rounded-xl border border-[var(--line)] p-6 sm:col-span-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-9 w-48 rounded-md" />
          </div>
        </div>
      </section>

      <section>
        <Skeleton className="h-8 w-32 sm:h-9" />
        <Skeleton className="mt-4 h-4 w-full max-w-2xl" />
      </section>

      <Skeleton className="aspect-[16/9] w-full rounded-2xl" />
    </div>
  );
}
