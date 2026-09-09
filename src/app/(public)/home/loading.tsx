import { Skeleton } from "@/components/ui/skeleton";

export default function HomeLoading() {
  return (
    // /home has no layout.tsx, so it has no PageShell ancestor -- it has to
    // carry the skip link target itself.
    <main
      id="main-content"
      tabIndex={-1}
      className="app-shell px-6 py-8 outline-none sm:px-10"
    >
      <div className="mx-auto max-w-6xl">
        <section className="flex flex-col items-center text-center">
          <Skeleton className="aspect-[21/9] w-full max-w-5xl rounded-2xl" />

          <div className="mt-5 w-full max-w-xl">
            <div className="rainbow-accent w-full" />
            <Skeleton className="mt-4 h-10 w-full sm:h-12" />
          </div>
          <Skeleton className="mt-3 h-10 w-2/3 max-w-md sm:h-12" />
          <div className="mt-3 w-full max-w-xl space-y-2">
            <Skeleton className="mx-auto h-4 w-full" />
            <Skeleton className="mx-auto h-4 w-5/6" />
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Skeleton className="h-9 w-32 rounded-md" />
            <Skeleton className="h-9 w-32 rounded-md" />
            <Skeleton className="h-9 w-24 rounded-md" />
          </div>
        </section>

        {/* Deliberately settings-agnostic, at the registry defaults: three
            slots in the flier grid. `layout.home_upcoming_count` and
            `layout.home_upcoming_cards` decide what actually renders, but a
            Suspense fallback has to render synchronously, and awaiting them
            would delay the whole skeleton -- including the hero above, which
            every tenant sees -- to tidy a swap only tenants off the defaults
            ever meet. */}
        <section className="mt-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="w-fit">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="mt-2 h-7 w-56 sm:h-8" />
            </div>
            <Skeleton className="h-5 w-28" />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((card) => (
              <div
                key={card}
                className="overflow-hidden rounded-xl ring-1 ring-foreground/10"
              >
                <Skeleton className="aspect-[16/9] w-full rounded-none" />
                <div className="space-y-2 px-4 py-3">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-5 w-4/5" />
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
