import { Skeleton } from "@/components/ui/skeleton";

export default function HomeLoading() {
  return (
    <main className="app-shell px-6 py-8 sm:px-10">
      <div className="mx-auto max-w-6xl">
        <section className="flex flex-col items-center text-center">
          <Skeleton className="aspect-[21/9] w-full max-w-5xl rounded-2xl" />

          <div className="rainbow-accent mt-5 w-32" />

          <Skeleton className="mt-4 h-10 w-full max-w-xl sm:h-12" />
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

        <section className="mt-16 rounded-xl border border-[var(--line)] p-6 text-center sm:p-8">
          <Skeleton className="mx-auto h-3 w-16" />
          <Skeleton className="mx-auto mt-3 h-6 w-2/3 max-w-sm sm:h-7" />
          <Skeleton className="mx-auto mt-2 h-4 w-1/2 max-w-xs" />
          <Skeleton className="mx-auto mt-4 h-9 w-40 rounded-md" />
        </section>
      </div>
    </main>
  );
}
