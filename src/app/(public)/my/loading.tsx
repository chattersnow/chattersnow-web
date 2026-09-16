import { PageShell } from "@/components/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * `/my` reads in two waves -- the site, the pending claim and the session,
 * then the history and the vocabulary -- so it is the slowest page in the area
 * and was the one with no fallback at all.
 *
 * Through PageShell, like the page it stands in for: the area's layout is gate
 * and slot, so a loading file that rendered a bare div would drop the `<main>`
 * for as long as it was on screen.
 */
export default function MyLoading() {
  return (
    <PageShell maxWidth="max-w-3xl">
      <div className="space-y-8">
        <section>
          <div className="w-fit">
            <div className="rainbow-accent w-full" />
            <Skeleton className="mt-4 h-10 w-56 sm:h-12" />
          </div>
          <Skeleton className="mt-4 h-4 w-full max-w-md" />
          <div className="mt-4 flex flex-wrap gap-3">
            <Skeleton className="h-11 w-32 rounded-lg" />
            <Skeleton className="h-11 w-32 rounded-lg" />
            <Skeleton className="h-11 w-28 rounded-lg" />
            <Skeleton className="h-11 w-28 rounded-lg" />
          </div>
        </section>

        <div className="space-y-6">
          {[0, 1].map((section) => (
            <div
              key={section}
              className="space-y-4 rounded-xl border border-[var(--line)] p-6"
            >
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
