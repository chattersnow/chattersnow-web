import { Skeleton } from "@/components/ui/skeleton";
import { MyPageSkeleton } from "./my-page-layout";

/**
 * `/my` reads in two waves -- the site, the pending claim and the session,
 * then the history and the vocabulary -- so it is the slowest page in the area
 * and was the one with no fallback at all.
 *
 * Through `MyPageSkeleton`, like the page it stands in for: the area's layout
 * is gate and slot, so a loading file that rendered a bare div would drop the
 * `<main>` for as long as it was on screen.
 */
export default function MyLoading() {
  return (
    <MyPageSkeleton
      titleWidth="w-56"
      intro={<Skeleton className="h-4 w-full max-w-md" />}
    >
      <div className="space-y-6">
        {[0, 1].map((section) => (
          <div
            key={section}
            className="space-y-4 rounded-xl border border-[var(--line)] p-6"
          >
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ))}
      </div>
    </MyPageSkeleton>
  );
}
