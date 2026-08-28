import { PageShell } from "@/components/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function CommunityCalendarLoading() {
  return (
    <PageShell>
      <section>
        <div className="rainbow-accent mb-4 w-16" />
        <Skeleton className="h-10 w-80 sm:h-12" />
        <Skeleton className="mt-4 h-4 w-full max-w-3xl" />
        <Skeleton className="mt-2 h-4 w-2/3 max-w-3xl" />
      </section>

      <div className="mt-10">
        <Skeleton className="h-7 w-32" />
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="space-y-2 rounded-xl border border-[var(--line)] p-4"
            >
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
