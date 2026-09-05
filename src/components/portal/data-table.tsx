"use client";

import { useMemo, useState, type ReactNode } from "react";
import { SortHeaderButton } from "@/components/portal/sort-header-link";
import { Card, CardContent } from "@/components/ui/card";
import { PaginationNav, RowsPerPageSelect } from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type HideBelow,
  type StickyHeader,
} from "@/components/ui/table";
import { PAGE_SIZE_OPTIONS } from "@/lib/pagination";

export type SortValue = string | number | null | undefined;

export type PortalDataTableColumn<T, K extends string = string> = {
  key: K;
  /**
   * Stays a string rather than a ReactNode: it doubles as the sort button's
   * accessible name, and as the whole name of an actions column.
   */
  label: string;
  render: (row: T) => ReactNode;
  /**
   * Present means sortable. One field rather than the `sortable` /
   * `sortValue` pair the ticket sketched, because both of that pair's mixed
   * states are meaningless -- sortable with nothing to sort by, or a
   * comparator that never runs.
   */
  sortValue?: (row: T) => SortValue;
  headClassName?: string;
  cellClassName?: string;
  /**
   * Dropping the column below a breakpoint. `Table` supports this on the
   * header and the body cell separately, with a "must match" comment; here
   * they come from one field, so they cannot fall out of step.
   */
  hideBelow?: HideBelow;
  /** Actions columns: named for a screen reader, blank on screen. */
  srOnlyLabel?: boolean;
};

/**
 * The ops portal's table.
 *
 * An audit for #506 found sixty table components, of which eight sorted, a
 * handful paginated and none kept their header on screen. Every page had
 * hand-rolled whichever of those it happened to need. This owns all three,
 * plus the Card/Table shell, so a reader gets the same table everywhere and a
 * page only has to say what its columns are.
 *
 * Filtering deliberately stays upstream: pages filter with their own toolbar
 * state and hand over the rows that survived. That also means this cannot
 * tell "nothing exists yet" from "the filters excluded everything" -- it only
 * renders the second, as `emptyMessage`. The first is a different sentence,
 * usually with a "create one" action attached, and belongs to the page.
 */
export function PortalDataTable<T, K extends string = string>({
  columns,
  rows,
  getRowKey,
  defaultSort,
  emptyMessage,
  stickyHeader = "page",
  stickyFirstColumn,
  shell = "card",
}: {
  columns: readonly PortalDataTableColumn<T, K>[];
  /** Already filtered. */
  rows: readonly T[];
  getRowKey: (row: T) => string;
  defaultSort?: { key: K; dir: SortDirection };
  emptyMessage: string;
  stickyHeader?: StickyHeader | "none";
  stickyFirstColumn?: boolean;
  /** `bare` for a table inside a sheet, which brings its own surface. */
  shell?: "card" | "bare";
}) {
  const [sort, setSort] = useState<{ key: K; dir: SortDirection } | null>(
    defaultSort ?? null,
  );
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);

  const sorted = useMemo(() => {
    const sortValue = columns.find((column) => column.key === sort?.key)
      ?.sortValue;
    if (!sort || !sortValue) return rows;
    const sign = sort.dir === "asc" ? 1 : -1;
    // Copied, never sorted in place: the caller's array is usually its own
    // memoized filter result. Sort has been stable since ES2019, so ties keep
    // the order the server returned them in, which is the meaningful
    // secondary sort -- and they keep it in both directions, because the
    // direction sign is applied to the comparison rather than the result.
    return [...rows].sort((a, b) => {
      const left = sortValue(a);
      const right = sortValue(b);
      // Blanks last whichever way the column is pointing, matching the
      // `nullsFirst: false` the server-side lists order by. A column that
      // wants them first can return "" instead.
      if (left == null || right == null) {
        return left == null ? (right == null ? 0 : 1) : -1;
      }
      return sign * compareValues(left, right);
    });
  }, [rows, columns, sort]);

  // The page is derived rather than synchronised. A page number only means
  // anything against the row count, sort and page size it was chosen under,
  // so it is stored next to them and falls back to the first page the moment
  // any of those move -- no effect, and no state adjustment during render
  // either.
  //
  // Keyed on the row count and not on the array's identity: pages build their
  // filtered list inline, so a fresh array on every render is the normal
  // case, and keying on identity would snap the reader back to page one on
  // every unrelated keystroke.
  const signature = `${rows.length}|${sort?.key ?? ""}|${sort?.dir ?? ""}|${pageSize}`;
  const [pageState, setPageState] = useState({ page: 1, signature });
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(
    pageState.signature === signature ? pageState.page : 1,
    totalPages,
  );
  const visible = sorted.slice((page - 1) * pageSize, page * pageSize);

  // Against the smallest option, not the current one: twenty rows fit a
  // twenty-five-row page, and hiding the footer for them would take away the
  // only control that could put the reader back on ten.
  const showFooter = rows.length > PAGE_SIZE_OPTIONS[0];

  function handleSort(key: K) {
    setSort((previous) =>
      previous?.key === key
        ? { key, dir: previous.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  }

  const body = (
    <>
      <Table
        stickyHeader={stickyHeader === "none" ? undefined : stickyHeader}
        stickyFirstColumn={stickyFirstColumn}
      >
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead
                key={column.key}
                hideBelow={column.hideBelow}
                className={column.headClassName}
                // Undefined, not null, for a column that cannot be sorted:
                // that is what keeps `aria-sort` off it entirely.
                sortDirection={
                  column.sortValue
                    ? sort?.key === column.key
                      ? sort.dir
                      : null
                    : undefined
                }
              >
                {column.srOnlyLabel ? (
                  <span className="sr-only">{column.label}</span>
                ) : column.sortValue ? (
                  <SortHeaderButton
                    label={column.label}
                    dir={sort?.key === column.key ? sort.dir : null}
                    onSort={() => handleSort(column.key)}
                  />
                ) : (
                  column.label
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="app-muted text-center"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            visible.map((row) => (
              <TableRow key={getRowKey(row)}>
                {columns.map((column) => (
                  <TableCell
                    key={column.key}
                    hideBelow={column.hideBelow}
                    className={column.cellClassName}
                  >
                    {column.render(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {showFooter && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3">
          <RowsPerPageSelect value={pageSize} onChange={setPageSize} />
          <PaginationNav
            page={page}
            totalPages={totalPages}
            count={rows.length}
            pageSize={pageSize}
            onPageChange={(next) => setPageState({ page: next, signature })}
          />
        </div>
      )}
    </>
  );

  if (shell === "bare") return body;

  return (
    // `overflow-clip` rather than the Card's own `overflow-hidden`: `hidden`
    // makes the Card a scroll container, and a sticky header pins to the
    // nearest scroll container -- one that, here, never scrolls. `clip` clips
    // identically without being one.
    <Card className="overflow-clip">
      <CardContent className="px-0">{body}</CardContent>
    </Card>
  );
}

type SortDirection = "asc" | "desc";

/**
 * `numeric` so "Item 2" comes before "Item 10", which the default collation
 * does not do, and `base` so case and accents don't split values that read as
 * equal.
 */
const collator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

function compareValues(a: NonNullable<SortValue>, b: NonNullable<SortValue>) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return collator.compare(String(a), String(b));
}
