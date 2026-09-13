import { PageShell } from "@/components/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function EventDetailLoading() {
  return (
    <PageShell maxWidth="max-w-3xl">
      <Skeleton className="mb-6 aspect-[16/9] w-full rounded-lg" />

      <section>
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-3 h-10 w-full max-w-md sm:h-12" />
        <Skeleton className="mt-4 h-4 w-48" />
        <div className="mt-6 max-w-2xl space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </section>
    </PageShell>
  );
}
