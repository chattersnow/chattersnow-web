import { Skeleton } from "@/components/ui/skeleton";

export default function PartnerLoading() {
  return (
    <div>
      <section>
        <Skeleton className="h-10 w-56 sm:h-12" />
        <div className="mt-4 max-w-3xl space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <Skeleton className="mt-4 h-9 w-44 rounded-md" />
        <Skeleton className="mt-8 aspect-[21/9] w-full rounded-2xl" />
      </section>
    </div>
  );
}
