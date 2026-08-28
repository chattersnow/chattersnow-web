import { Skeleton } from "@/components/ui/skeleton";

export default function HomeLoading() {
  return (
    <main className="app-shell px-6 py-10 sm:px-10">
      <div className="mx-auto max-w-3xl">
        <section className="flex flex-col items-center text-center">
          <Skeleton className="aspect-square w-[min(60vw,14rem)] rounded-full" />

          <div className="rainbow-accent mt-6 w-32" />

          <Skeleton className="mt-6 h-10 w-full max-w-xl sm:h-12" />
          <Skeleton className="mt-3 h-10 w-2/3 max-w-md sm:h-12" />
          <div className="mt-4 w-full max-w-xl space-y-2">
            <Skeleton className="mx-auto h-4 w-full" />
            <Skeleton className="mx-auto h-4 w-5/6" />
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Skeleton className="h-9 w-32 rounded-md" />
            <Skeleton className="h-9 w-32 rounded-md" />
            <Skeleton className="h-9 w-24 rounded-md" />
          </div>
        </section>

        <div className="mt-12">
          <Skeleton className="mx-auto aspect-video max-w-md rounded-2xl" />
        </div>
      </div>
    </main>
  );
}
