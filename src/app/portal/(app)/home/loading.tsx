import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCardsSkeleton } from "@/components/portal/page-skeleton";

export default function HomeLoading() {
  return (
    <>
      <div className="rainbow-accent mb-2 w-16" />
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-2 h-10 w-64" />
      <StatCardsSkeleton />
      <div className="mt-6 grid items-start gap-x-6 gap-y-6 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index}>
            <CardHeader>
              <Skeleton className="h-4 w-28" />
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
