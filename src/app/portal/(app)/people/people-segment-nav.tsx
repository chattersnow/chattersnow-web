import Link from "next/link";
import { LinkPendingPulse } from "@/components/link-pending";
import { cn } from "@/lib/utils";
import type { Lexicon } from "@/lib/lexicon";
import { PEOPLE_SEGMENTS, segmentNavLabel } from "./people-segments";

/**
 * The strip that turns eight sidebar entries into one page (#957).
 *
 * Links rather than `useUrlTabState`, which every other tab strip in the
 * portal uses. That hook exists to write the URL *without* re-running the
 * server component -- correct where the panels are already rendered and the
 * tab only chooses which to show. Here the segment decides the query: a
 * different `filterColumn`, a different `person_type`, different stat tiles.
 * A pushState that did not re-fetch would show the previous segment's rows
 * under the new segment's heading. So these are real navigations to real
 * routes, which satisfies the same rule -- every segment has a URL, Back
 * works, and any of them can be linked or bookmarked.
 *
 * Filters are deliberately not carried across: a search or a sort belongs to
 * the segment it was typed in, and "Summit" narrowing Donors means nothing
 * once the reader has asked for Staff.
 */
export function PeopleSegmentNav({
  active,
  vocabulary,
}: {
  /** The `value` of the segment being shown. */
  active: string;
  vocabulary: Lexicon;
}) {
  return (
    <nav
      aria-label="People segments"
      className="mt-6 flex flex-wrap items-center gap-1 rounded-xl border border-[var(--line)] p-2"
    >
      {PEOPLE_SEGMENTS.map((segment) => {
        const current = segment.value === active;
        return (
          <Link
            key={segment.value}
            href={segment.basePath}
            aria-current={current ? "page" : undefined}
            className={cn(
              // py-2 keeps every chip past the 24px minimum target size on
              // mobile, where eight of them sit close together.
              "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              current
                ? "bg-[var(--purple-soft)] text-foreground"
                : "app-muted hover:bg-muted hover:text-foreground",
            )}
          >
            <LinkPendingPulse>
              {segmentNavLabel(segment, vocabulary)}
            </LinkPendingPulse>
          </Link>
        );
      })}
    </nav>
  );
}
