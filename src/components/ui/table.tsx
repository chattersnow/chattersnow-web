"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Breakpoint below which a column is dropped. Written out as whole class
 * strings rather than composed at runtime, because Tailwind scans source text
 * and never sees an interpolated class name.
 */
const HIDE_BELOW = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
} as const;

export type HideBelow = keyof typeof HIDE_BELOW;

/**
 * Where a sticky header pins to. `page` is the portal's window scroll, so the
 * header stops under the sticky top bar; `container` is a scroller of the
 * table's own -- a ListPreviewSheet body -- whose surface is the popover
 * rather than the card. Whole class strings, same reason as HIDE_BELOW.
 *
 * The rule rides on the header cells, not on `<thead>`: preflight sets
 * `border-collapse: collapse`, and a collapsed border belongs to the table
 * box, so a `th` that has scrolled away from its row leaves its bottom rule
 * behind. The inset shadow travels with the cell and lands on exactly the
 * pixel `TableHeader`'s own `border-b` occupies when nothing is stuck.
 */
const STICKY_HEADER = {
  page: "[&_thead_th]:sticky [&_thead_th]:top-(--portal-header-height) [&_thead_th]:z-20 [&_thead_th]:bg-card [&_thead_th]:shadow-[inset_0_-1px_0_var(--line)]",
  container:
    "[&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-20 [&_thead_th]:bg-popover [&_thead_th]:shadow-[inset_0_-1px_0_var(--line)]",
} as const;

export type StickyHeader = keyof typeof STICKY_HEADER;

function Table({
  className,
  stickyFirstColumn,
  stickyHeader,
  ...props
}: React.ComponentProps<"table"> & {
  /**
   * Pins the first cell of every row while the rest scrolls. Row actions are
   * always the last column, so on a phone -- where a 7-column table shows
   * about two columns at a time -- scrolling right to reach them took the
   * row's identifying name off screen with no way to tell rows apart.
   */
  stickyFirstColumn?: boolean;
  /**
   * Keeps the header row on screen while the table scrolls past it. Honoured
   * only while the table fits its container -- see the overflow note below.
   */
  stickyHeader?: StickyHeader;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  // Seeded true so the server renders the scrolling wrapper it has always
  // rendered: a wide table on a phone would otherwise be clipped and
  // unreachable between paint and hydration. The observer turns it off on
  // its first measurement, which costs a fitting table a tab stop for one
  // frame.
  const [scrollable, setScrollable] = React.useState(true);

  // A container that scrolls but holds no focusable content is unreachable by
  // keyboard: there is nothing to tab towards, so the columns past the right
  // edge can never be read. It earns a tab stop of its own, but only while it
  // actually overflows -- otherwise every table on the page would add a stop
  // that does nothing. ResizeObserver fires once on observe, so this covers
  // the first measurement as well as later resizes.
  React.useEffect(() => {
    const container = containerRef.current;
    const table = container?.firstElementChild;
    if (!container || !table) return;
    // Measures the table against the container rather than reading the
    // container's own scrollWidth: dropping `overflow-x-auto` below stops the
    // container reporting overflow at all, so a self-measurement would latch
    // on and never let go. The 1px allowance absorbs sub-pixel table widths
    // rounding against an integer clientWidth.
    const measure = () =>
      setScrollable(
        table.getBoundingClientRect().width - container.clientWidth > 1,
      );
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    // The table can change width without the container doing so.
    observer.observe(table);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      data-slot="table-container"
      tabIndex={scrollable ? 0 : undefined}
      // `overflow-x-auto` only while it is needed. `overflow-x: auto` computes
      // `overflow-y` to `auto`, which makes this div a scroll container, which
      // is what a sticky header pins to -- and this one never scrolls
      // vertically, so the header would sit 73px down over the first rows
      // rather than following the page. Off, the header finds the viewport.
      //
      // `isolate` because the sticky cells below need z-20 to clear
      // stickyFirstColumn's z-10 body cells, and at equal z-index the later
      // element wins -- which would put the table header over the portal's
      // own top bar. One stacking context of its own keeps the internal
      // layering free and the whole table under that bar.
      className={cn(
        "relative isolate w-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        scrollable && "overflow-x-auto",
      )}
    >
      <table
        data-slot="table"
        className={cn(
          "w-full caption-bottom text-sm",
          // Row actions are ghost icon buttons, which show no border or fill
          // until hovered -- on a touch device that means no affordance at
          // all, just a column of grey glyphs to guess at. Inside a cell they
          // keep a faint resting outline; the hover and focus treatments the
          // variant already provides still take over on top.
          "[&_td_[data-slot=button][data-variant=ghost]]:border-[var(--line)]",
          // Honoured only when the container is not scrolling: see above.
          stickyHeader && !scrollable && STICKY_HEADER[stickyHeader],
          // The corner cell is pinned on both axes, so it has to clear the
          // body's pinned column as well as its own row.
          stickyHeader && stickyFirstColumn && "[&_thead_th:first-child]:z-30",
          stickyFirstColumn && [
            "[&_tr>*:first-child]:sticky [&_tr>*:first-child]:left-0 [&_tr>*:first-child]:z-10 [&_tr>*:first-child]:bg-card",
            // The pinned cell needs an opaque background to sit over the
            // scrolling columns, which means it can't inherit the row's
            // translucent hover/selected tint -- mix it in explicitly, or the
            // hovered row highlights every cell except this one.
            "[&_tr:hover>*:first-child]:bg-[color-mix(in_oklab,var(--muted)_50%,var(--card))]",
            "[&_tr[data-state=selected]>*:first-child]:bg-muted",
          ],
          className,
        )}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className,
      )}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({
  className,
  hideBelow,
  sortDirection,
  ...props
}: React.ComponentProps<"th"> & {
  /** Drop this column below the given breakpoint. Must match the body cell. */
  hideBelow?: HideBelow;
  /**
   * Set on every header of a sortable table -- null for the columns that
   * aren't the active sort. `aria-sort` appeared nowhere in the codebase, so
   * no sorted table announced its state.
   */
  sortDirection?: "asc" | "desc" | null;
}) {
  return (
    <th
      data-slot="table-head"
      aria-sort={
        sortDirection === undefined
          ? undefined
          : sortDirection === "asc"
            ? "ascending"
            : sortDirection === "desc"
              ? "descending"
              : "none"
      }
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        hideBelow && HIDE_BELOW[hideBelow],
        className,
      )}
      {...props}
    />
  );
}

function TableCell({
  className,
  hideBelow,
  ...props
}: React.ComponentProps<"td"> & {
  /** Drop this column below the given breakpoint. Must match the header. */
  hideBelow?: HideBelow;
}) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        hideBelow && HIDE_BELOW[hideBelow],
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
