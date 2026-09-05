import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LinkPendingPulse } from "@/components/link-pending";
import { FilterSubmitButton } from "@/components/filter-submit-button";
import { PAGE_SIZE, PAGE_SIZE_OPTIONS } from "@/lib/pagination";

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

/**
 * The record range and page number, shared by both pagers below so the two
 * can't drift into wording the same thing differently.
 *
 * `role="status"` because the button-driven pager changes it without a
 * navigation: a screen reader would otherwise get no signal that the page
 * moved. Not `app-muted` -- that token is already the portal's biggest
 * contrast offender and this line is the only feedback a page change gives.
 */
function PaginationSummary({
  page,
  totalPages,
  count,
  pageSize,
}: {
  page: number;
  totalPages: number;
  count?: number | null;
  pageSize: number;
}) {
  const first = (page - 1) * pageSize + 1;
  const last =
    count == null ? page * pageSize : Math.min(page * pageSize, count);

  return (
    <p role="status" className="text-sm">
      {count != null && count > 0 ? (
        <>
          Showing {first.toLocaleString("en-US")}–{last.toLocaleString("en-US")}{" "}
          of {count.toLocaleString("en-US")}
          {" · "}
        </>
      ) : null}
      Page {page} of {totalPages}
    </p>
  );
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
  const { action, hidden } = formTargetFrom(hrefFor(page), pageParam);
  const jumpId = `page-jump-${pageParam}`;

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <PaginationSummary
        page={page}
        totalPages={totalPages}
        count={count}
        pageSize={pageSize}
      />
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

/**
 * Prev/Next for a list the client already holds in full, as the sibling of
 * the link-driven `Pagination` above -- the same split, and for the same
 * reason, as `SortHeaderLink` / `SortHeaderButton`. Keeping both in this file
 * is what stops the portal shipping two pagers that look and read differently
 * within one milestone.
 *
 * No jump form: that exists because the server lists run to hundreds of
 * pages at fifty rows each. A client-held list at ten or twenty-five is a
 * handful of pages, and the form's whole mechanism is rebuilding query
 * params, which means nothing here.
 */
export function PaginationNav({
  page,
  totalPages,
  count,
  pageSize,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  count?: number | null;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <PaginationSummary
        page={page}
        totalPages={totalPages}
        count={count}
        pageSize={pageSize}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

/**
 * The rows-per-page choice. Shared rather than local to the client table so
 * the server-paginated pages can wire the same control to a URL param
 * instead of state.
 *
 * The control carries the name and the text beside it is hidden from the
 * accessibility tree rather than associated with `aria-labelledby`: an id
 * needs `useId`, and this module is imported by the server pages that render
 * the link pager above, which may not run hooks. Same words either way, so
 * the visible label and the accessible name still match.
 */
export function RowsPerPageSelect({
  value,
  onChange,
  options = PAGE_SIZE_OPTIONS,
}: {
  value: number;
  onChange: (value: number) => void;
  options?: readonly number[];
}) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden="true" className="app-muted text-sm">
        Rows per page
      </span>
      <Select
        value={String(value)}
        onValueChange={(next) => onChange(Number(next))}
      >
        <SelectTrigger size="sm" aria-label="Rows per page" className="w-20">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={String(option)}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
