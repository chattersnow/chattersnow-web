import { PageShell } from "@/components/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

/** The page's shape while it loads: breadcrumb, details left, flier right. */
export default function EventDetailLoading() {
  return (
    <PageShell>
      <Skeleton className="mb-6 h-4 w-40" />

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-12">
        <Skeleton className="mb-6 aspect-square w-full max-w-sm rounded-lg lg:order-2 lg:mb-0" />
        <section className="lg:order-1">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-10 w-full max-w-md sm:h-12" />
          <Skeleton className="mt-4 h-4 w-48" />
          <div className="mt-6 max-w-2xl space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </section>
      </div>
    </PageShell>
  );
}
