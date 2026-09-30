import { Skeleton } from "@/components/ui/skeleton";

export default function PublicationsLoading() {
  return (
    <div>
      <div className="w-fit">
        <div className="rainbow-accent mb-4 w-full" />
        <Skeleton className="h-10 w-40 sm:h-12" />
      </div>
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="aspect-[1/1.414] w-full rounded-xl" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
