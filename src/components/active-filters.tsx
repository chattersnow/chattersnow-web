import Link from "next/link";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LinkPendingPulse } from "@/components/link-pending";

export type ActiveFilter = {
  /** Query parameter this chip removes. */
  param: string;
  /** What the filter is, e.g. "Role". */
  label: string;
  /** What it's set to, in the words the filter control uses. */
  value: string;
};

/**
 * Names the filters currently narrowing the list, and lets each one go.
 *
 * After filtering, the page showed a Filters button with a count badge and
 * nothing else: no indication of *what* was on, and the Clear control lived
 * inside the sheet, so removing one filter meant reopening the sheet to find
 * out what was there. A partially filtered result set -- the common case --
 * gave no signal at all, which is worst for someone returning to a tab or
 * opening a filtered URL a colleague shared.
 *
 * Each chip is a plain link to the same page minus that parameter, so this
 * works without JavaScript and keeps the URL the source of truth, the same
 * way the filter form itself does.
 */
export function ActiveFilters({
  action,
  filters,
  /** Every currently-set parameter, so removing one keeps the others. */
  params,
}: {
  action: string;
  filters: readonly ActiveFilter[];
  params: Record<string, string>;
}) {
  if (filters.length === 0) return null;

  function hrefWithout(param: string) {
    const next = new URLSearchParams(
      Object.entries(params).filter(
        ([key, value]) => key !== param && value !== "" && value !== "all",
      ),
    );
    const query = next.toString();
    return query ? `${action}?${query}` : action;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="app-muted text-xs font-semibold tracking-[0.1em] uppercase">
        Filtered by
      </span>
      {filters.map((filter) => (
        <Badge key={filter.param} variant="secondary" className="gap-1 pr-1">
          <span className="app-muted">{filter.label}:</span>
          <span className="max-w-40 truncate">{filter.value}</span>
          <Link
            href={hrefWithout(filter.param)}
            aria-label={`Remove ${filter.label} filter`}
            className="-mr-0.5 flex size-5 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10"
          >
            <LinkPendingPulse>
              <X className="size-3" />
            </LinkPendingPulse>
          </Link>
        </Badge>
      ))}
      {filters.length > 1 && (
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href={action} />}
        >
          <LinkPendingPulse>Clear all</LinkPendingPulse>
        </Button>
      )}
    </div>
  );
}
