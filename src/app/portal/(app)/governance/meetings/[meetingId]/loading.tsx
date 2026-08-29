import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function FieldCardSkeleton({ rows }: { rows: number }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-4 w-32" />
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-40" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SectionSkeleton() {
  return (
    <div className="mt-6">
      <Skeleton className="h-3 w-24" />
      <div className="mt-3">
        <Card>
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function MeetingDetailLoading() {
  return (
    <>
      <div className="rainbow-accent w-16" />
      <Skeleton className="mb-2 h-5 w-24" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Skeleton className="h-10 w-64" />
          <div className="mt-2 flex gap-2">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-8 w-20" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <FieldCardSkeleton rows={4} />
        <FieldCardSkeleton rows={3} />
      </div>

      {["Attendees", "Agenda", "Action Items", "Decisions", "Resolutions"].map(
        (label) => (
          <SectionSkeleton key={label} />
        ),
      )}
    </>
  );
}
