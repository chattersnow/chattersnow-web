import { Skeleton } from "@/components/ui/skeleton";
import { MyPageSkeleton } from "../my-page-layout";

export default function MyHoursLoading() {
  return (
    <MyPageSkeleton
      titleWidth="w-56"
      intro={
        <>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </>
      }
    >
      <div className="space-y-4 rounded-xl border border-[var(--line)] p-6">
        {[0, 1, 2, 3].map((field) => (
          <Skeleton key={field} className="h-9 w-full rounded-lg" />
        ))}
        <Skeleton className="h-8 w-32 rounded-lg" />
      </div>
    </MyPageSkeleton>
  );
}
