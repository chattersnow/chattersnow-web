import { Skeleton } from "@/components/ui/skeleton";

export default function SponsorshipLoading() {
  return (
    <div className="space-y-12">
      <section>
        <div className="w-fit">
          <div className="rainbow-accent mb-4 w-full" />
          <Skeleton className="h-10 w-48 sm:h-12" />
        </div>
        <div className="mt-4 max-w-3xl space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
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

      <Skeleton className="h-9 w-52 rounded-md" />

      <section className="grid gap-6 sm:grid-cols-2">
        <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
        <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
      </section>
    </div>
  );
}
