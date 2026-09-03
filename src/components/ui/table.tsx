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

function Table({
  className,
  stickyFirstColumn,
  ...props
}: React.ComponentProps<"table"> & {
  /**
   * Pins the first cell of every row while the rest scrolls. Row actions are
   * always the last column, so on a phone -- where a 7-column table shows
   * about two columns at a time -- scrolling right to reach them took the
   * row's identifying name off screen with no way to tell rows apart.
   */
  stickyFirstColumn?: boolean;
}) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
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
