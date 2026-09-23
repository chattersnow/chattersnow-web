import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FieldCardSkeleton } from "@/components/portal/page-skeleton";

/** Mirrors the page's two columns so nothing jumps when it streams in. */
export default function AccountLoading() {
  return (
    <>
      <div className="w-fit">
        <Skeleton className="h-12 w-64" />
        <div className="rainbow-accent mt-3 w-full" />
      </div>
      <div className="mt-6 grid max-w-6xl items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6 lg:col-start-2 lg:row-start-1">
          <FieldCardSkeleton rows={2} />
          <FieldCardSkeleton rows={1} />
        </div>
        <Card className="lg:col-start-1 lg:row-start-1">
          <CardContent className="grid gap-x-8 gap-y-4 xl:grid-cols-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
