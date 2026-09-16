import { PageShell } from "@/components/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function MyDetailsLoading() {
  return (
    <PageShell maxWidth="max-w-2xl">
      <div className="space-y-8">
        <section>
          <div className="w-fit">
            <div className="rainbow-accent w-full" />
            <Skeleton className="mt-4 h-10 w-48 sm:h-12" />
          </div>
          <Skeleton className="mt-4 h-4 w-full max-w-md" />
          <div className="mt-4 flex flex-wrap gap-3">
            <Skeleton className="h-11 w-32 rounded-lg" />
            <Skeleton className="h-11 w-32 rounded-lg" />
            <Skeleton className="h-11 w-28 rounded-lg" />
            <Skeleton className="h-11 w-28 rounded-lg" />
          </div>
        </section>

        {/* Email, then everything else -- fourteen fields in the second card,
            so it is much the taller of the two. */}
        <div className="space-y-4 rounded-xl border border-[var(--line)] p-6">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-9 w-full rounded-lg" />
        </div>
        <div className="space-y-4 rounded-xl border border-[var(--line)] p-6">
          <Skeleton className="h-5 w-36" />
          {[0, 1, 2, 3, 4].map((field) => (
            <Skeleton key={field} className="h-9 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </PageShell>
  );
}
