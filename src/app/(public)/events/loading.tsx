import { PageShell } from "@/components/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function EventsLoading() {
  return (
    <PageShell>
      <section>
        <div className="rainbow-accent mb-4 w-16" />
        <Skeleton className="h-10 w-72 sm:h-12 sm:w-96" />
        <Skeleton className="mt-4 h-4 w-full max-w-3xl" />
      </section>

      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-xl border border-[var(--line)]"
          >
            <Skeleton className="aspect-[16/9] w-full rounded-none" />
            <div className="space-y-2 px-4 py-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
