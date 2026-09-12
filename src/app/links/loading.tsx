import { Skeleton } from "@/components/ui/skeleton";

export default function LinksLoading() {
  return (
    <div className="flex w-full flex-col items-center">
      <Skeleton className="size-20 rounded-full" />
      <Skeleton className="mt-4 h-7 w-48" />
      <Skeleton className="mt-2 h-4 w-56" />
      <Skeleton className="mt-8 h-3 w-28" />
      <div className="mt-6 w-full space-y-3">
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
      </div>
    </div>
  );
}
