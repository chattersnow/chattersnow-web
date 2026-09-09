import { PageShell } from "@/components/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function BrandLoading() {
  return (
    <PageShell maxWidth="max-w-4xl">
      <div className="space-y-10">
        <header>
          <div className="rainbow-accent" />
          <Skeleton className="mt-4 h-3 w-24" />
          <Skeleton className="mt-3 h-10 w-72 sm:h-12" />
          <div className="mt-4 max-w-2xl space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </header>

        <div className="flex flex-wrap gap-4 border-y border-[var(--line)] py-3">
          {Array.from({ length: 7 }, (_, index) => (
            <Skeleton key={index} className="h-4 w-16" />
          ))}
        </div>

        <div className="border-t border-[var(--line)] pt-10">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-7 w-40" />
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-52 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
