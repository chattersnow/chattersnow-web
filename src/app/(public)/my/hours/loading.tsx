import { PageShell } from "@/components/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function MyHoursLoading() {
  return (
    <PageShell maxWidth="max-w-2xl">
      <div className="space-y-8">
        <section>
          <div className="w-fit">
            <div className="rainbow-accent w-full" />
            <Skeleton className="mt-4 h-10 w-56 sm:h-12" />
          </div>
          <div className="mt-4 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Skeleton className="h-11 w-32 rounded-lg" />
            <Skeleton className="h-11 w-32 rounded-lg" />
            <Skeleton className="h-11 w-28 rounded-lg" />
            <Skeleton className="h-11 w-28 rounded-lg" />
          </div>
        </section>

        <div className="space-y-4 rounded-xl border border-[var(--line)] p-6">
          {[0, 1, 2, 3].map((field) => (
            <Skeleton key={field} className="h-9 w-full rounded-lg" />
          ))}
          <Skeleton className="h-8 w-32 rounded-lg" />
        </div>
      </div>
    </PageShell>
  );
}
