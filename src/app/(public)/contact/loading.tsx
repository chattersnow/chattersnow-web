import { Skeleton } from "@/components/ui/skeleton";

export default function ContactLoading() {
  return (
    <div className="space-y-12">
      <section>
        <div className="w-fit">
          <div className="rainbow-accent mb-4 w-full" />
          <Skeleton className="h-10 w-48 sm:h-12" />
        </div>
        <div className="mt-4 max-w-3xl space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-[var(--line)] p-6">
          <Skeleton className="h-9 w-full rounded-md" />
          <Skeleton className="h-9 w-full rounded-md" />
          <Skeleton className="h-24 w-full rounded-md" />
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>

        <div className="space-y-8">
          <div className="space-y-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-36" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-3">
        <Skeleton className="aspect-square w-full rounded-2xl" />
        <Skeleton className="aspect-square w-full rounded-2xl" />
        <Skeleton className="aspect-square w-full rounded-2xl" />
      </section>
    </div>
  );
}
