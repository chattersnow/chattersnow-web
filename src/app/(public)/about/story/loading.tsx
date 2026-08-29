import { Skeleton } from "@/components/ui/skeleton";

export default function StoryLoading() {
  return (
    <div>
      <section>
        <div className="w-fit">
          <div className="rainbow-accent mb-4 w-full" />
          <Skeleton className="h-10 w-64 sm:h-12" />
        </div>
        <div className="mt-4 max-w-3xl space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </section>

      <section className="mt-12 grid gap-8 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Skeleton className="h-8 w-40 sm:h-9" />
          <div className="mt-4 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
        <Skeleton className="aspect-[3/4] w-full rounded-xl" />
      </section>
    </div>
  );
}
