import { Skeleton } from "@/components/ui/skeleton";
import { MyPageSkeleton } from "../my-page-layout";

export default function MyDetailsLoading() {
  return (
    <MyPageSkeleton
      titleWidth="w-48"
      intro={<Skeleton className="h-4 w-full max-w-md" />}
    >
      {/* Three groups of fields divided by rules, then the email card. The
          first group is much the tallest, so it carries most of the rows. */}
      {[5, 4, 2].map((fields, group) => (
        <div key={group} className="space-y-4">
          <Skeleton className="h-5 w-36" />
          {Array.from({ length: fields }, (_, field) => (
            <Skeleton key={field} className="h-9 w-full rounded-lg" />
          ))}
        </div>
      ))}
      <div className="space-y-4 rounded-xl border border-[var(--line)] p-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-9 w-full rounded-lg" />
      </div>
    </MyPageSkeleton>
  );
}
