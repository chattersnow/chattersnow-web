import { Skeleton } from "@/components/ui/skeleton";

export default function DonationsLoading() {
  return (
    <div className="space-y-12">
      <section>
        <Skeleton className="h-10 w-48 sm:h-12" />
        <div className="mt-4 max-w-3xl space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="space-y-3 rounded-xl border border-[var(--line)] p-6"
          >
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        ))}
      </section>

      <Skeleton className="aspect-[16/9] w-full rounded-2xl" />
    </div>
  );
}
