import { PageShell } from "@/components/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function MyNotificationsLoading() {
  return (
    <PageShell>
      <div className="space-y-8">
        <section>
          <div className="w-fit">
            <div className="rainbow-accent w-full" />
            <Skeleton className="mt-4 h-10 w-44 sm:h-12" />
          </div>
          <div className="mt-4 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Skeleton className="h-11 w-32 rounded-lg" />
            <Skeleton className="h-11 w-32 rounded-lg" />
            <Skeleton className="h-11 w-28 rounded-lg" />
            <Skeleton className="h-11 w-28 rounded-lg" />
          </div>
        </section>

        {/* One row per constituent notification kind, each a label and a
            switch. */}
        <div className="space-y-6 rounded-xl border border-[var(--line)] p-6">
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex items-center justify-between gap-4">
              <div className="w-full space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-64" />
              </div>
              <Skeleton className="h-6 w-11 shrink-0 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
