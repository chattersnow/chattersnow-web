import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LinkPendingPulse } from "@/components/link-pending";
import { FilterSubmitButton } from "@/components/filter-submit-button";
import { PAGE_SIZE } from "@/lib/pagination";

/**
 * Splits a page href into the parts a GET form needs to rebuild it: the
 * path to submit to and every query parameter except the page itself, which
 * the form's own input supplies. Deriving this from `hrefFor` keeps the
 * jump form on exactly the same filters and sort as the Previous/Next links
 * without each list page having to hand over its params a second time.
 */
function formTargetFrom(href: string, pageParam: string) {
  const url = new URL(href, "http://localhost");
  const hidden = Array.from(url.searchParams.entries()).filter(
    ([key]) => key !== pageParam,
  );
  return { action: url.pathname, hidden };
}

export function Pagination({
  page,
  totalPages,
  hrefFor,
  count,
  pageSize = PAGE_SIZE,
  pageParam = "page",
}: {
  page: number;
  totalPages: number;
  hrefFor: (page: number) => string;
  /** Total matching rows, when the query counted them. Shown as a range. */
  count?: number | null;
  pageSize?: number;
  /** The query parameter `hrefFor` writes the page number to. */
  pageParam?: string;
}) {
  const first = (page - 1) * pageSize + 1;
  const last =
    count == null ? page * pageSize : Math.min(page * pageSize, count);
  const { action, hidden } = formTargetFrom(hrefFor(page), pageParam);
  const jumpId = `page-jump-${pageParam}`;

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <p className="app-muted text-sm">
        {count != null && count > 0 ? (
          <>
            Showing {first.toLocaleString("en-US")}–
            {last.toLocaleString("en-US")} of {count.toLocaleString("en-US")}
            {" · "}
          </>
        ) : null}
        Page {page} of {totalPages}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {totalPages > 2 && (
          <form
            method="get"
            action={action}
            className="flex items-center gap-2"
          >
            {hidden.map(([key, value], index) => (
              <input
                key={`${key}-${index}`}
                type="hidden"
                name={key}
                value={value}
              />
            ))}
            <label htmlFor={jumpId} className="app-muted text-sm">
              Go to page
            </label>
            <Input
              id={jumpId}
              name={pageParam}
              type="number"
              inputMode="numeric"
              min={1}
              max={totalPages}
              defaultValue={page}
              className="h-8 w-20"
            />
            <FilterSubmitButton size="sm" variant="outline">
              Go
            </FilterSubmitButton>
          </form>
        )}
        {page > 1 ? (
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href={hrefFor(page - 1)} />}
          >
            <LinkPendingPulse>Previous</LinkPendingPulse>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Previous
          </Button>
        )}
        {page < totalPages ? (
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href={hrefFor(page + 1)} />}
          >
            <LinkPendingPulse>Next</LinkPendingPulse>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Next
          </Button>
        )}
      </div>
    </div>
  );
}
