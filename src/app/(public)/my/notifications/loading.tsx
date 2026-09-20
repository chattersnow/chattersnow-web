import { Skeleton } from "@/components/ui/skeleton";
import { MyPageSkeleton } from "../my-page-layout";

export default function MyNotificationsLoading() {
  return (
    <MyPageSkeleton
      titleWidth="w-44"
      intro={
        <>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-1/2" />
        </>
      }
    >
      {/* One row per constituent notification kind, each a label and a
          switch. */}
      <div className="space-y-6 rounded-xl border border-[var(--line)] p-6">
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex items-center justify-between gap-4">
            <div className="w-full space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-64" />
            </div>
            <Skeleton className="h-6 w-11 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </MyPageSkeleton>
  );
}
