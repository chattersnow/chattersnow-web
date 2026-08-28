import { Skeleton } from "@/components/ui/skeleton";

export default function LearnLoading() {
  return (
    <div>
      <div className="rainbow-accent mb-4 w-16" />
      <Skeleton className="h-10 w-32 sm:h-12" />
      <div className="mt-4 max-w-3xl space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="space-y-3 rounded-xl border border-[var(--line)] p-6"
          >
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
