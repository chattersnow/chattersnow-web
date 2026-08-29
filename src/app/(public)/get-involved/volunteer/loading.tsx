import { Skeleton } from "@/components/ui/skeleton";

export default function VolunteerLoading() {
  return (
    <div>
      <section>
        <div className="w-fit">
          <div className="rainbow-accent mb-4 w-full" />
          <Skeleton className="h-10 w-48 sm:h-12" />
        </div>
        <Skeleton className="mt-4 h-4 w-full max-w-3xl" />

        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="space-y-3 rounded-xl border border-[var(--line)] p-6"
            >
              <Skeleton className="size-10 rounded-full" />
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
