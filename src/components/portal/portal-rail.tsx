"use client";

import { useState, type ReactNode } from "react";
import { PanelLeftOpen, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { DeviceClass } from "@/proxy";

export type PortalRailState = {
  /** The search box's contents, trimmed and lower-cased; empty means none. */
  query: string;
  /**
   * Dismisses the rail, and runs `after` once it is really gone.
   *
   * On a phone the rail is a modal sheet, so it holds the page's scroll until
   * its closing transition finishes. Anything that moves or measures the page
   * underneath -- a `scrollIntoView`, a `focus()` -- has to wait for that, and
   * passing it here is how it does. Above `lg` there is nothing to wait for
   * and `after` runs on the spot.
   */
  close: (after?: () => void) => void;
};

/**
 * The one rail (#1093).
 *
 * "Past roughly ten parts, switch to a rail with search" is the portal's rule
 * (`docs/portal-navigation.md`), and Site Content and event detail had each
 * written their own answer to it: the same disclosure button, the same sticky
 * self-scrolling column, the same search over a grouped list, near enough the
 * same `calc()` whose underscores the comments below still warn about. This
 * owns all of that. What is in the list, how it is grouped and what a search
 * matches stay with the caller, which is what `children` is for.
 *
 * The two shapes:
 *
 * - **`lg` and up** -- a sticky column beside the page, exactly as before, with
 *   the disclosure kept for a desktop window narrower than `lg`.
 * - **A phone** -- the same button opens a sheet, matching the shell's "More"
 *   (#1079). Overlaying rather than expanding in place is the point: 19
 *   sections under four headings shoved the card the reader was working on far
 *   down the page, and closing returned them to a scroll position they had not
 *   chosen. Search is pinned above the results for the same reason -- it is the
 *   rail's whole answer to "where does this live?", and inline it scrolled away
 *   as soon as the reader looked at what it found.
 *
 * `device` comes from `deviceClass()` on the server, never `useIsMobile()`:
 * the hook answers `false` during SSR, so a phone would paint the full column
 * and swap it after hydration -- the flash #1079 exists to remove.
 */
export function PortalRail({
  id,
  device,
  label,
  hideLabel,
  title,
  description,
  searchLabel,
  searchPlaceholder,
  children,
}: {
  /** Ties the disclosure button to the column it controls, above `lg`. */
  id: string;
  device: DeviceClass;
  /** The button, naming the rail and where in it the reader is. */
  label: string;
  /** The same button once the desktop column's disclosure is open. */
  hideLabel: string;
  /** The sheet's heading, on a phone. */
  title: string;
  description: string;
  searchLabel: string;
  searchPlaceholder: string;
  children: (state: PortalRailState) => ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  // State rather than a ref: `close` is handed to `children` during render,
  // and a function that reads a ref there is exactly what the compiler's rules
  // forbid.
  const [afterClose, setAfterClose] = useState<(() => void) | null>(null);
  const trimmed = query.trim().toLowerCase();

  const close = (after?: () => void) => {
    setOpen(false);
    if (device === "mobile") {
      setAfterClose(() => after ?? null);
      return;
    }
    after?.();
  };

  const body = children({ query: trimmed, close });

  const searchBox = (
    <div className="relative">
      <Search
        className="app-muted pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
        aria-hidden
      />
      <Input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={searchPlaceholder}
        aria-label={searchLabel}
        className="pl-9"
      />
    </div>
  );

  const toggle = (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      // A section title can be long enough to wrap the button into two lines
      // at 390px, which is not what a label is for.
      className={cn("mb-3 max-w-full", device === "desktop" && "lg:hidden")}
      aria-expanded={open}
      {...(device === "mobile"
        ? { "aria-haspopup": "dialog" as const }
        : { "aria-controls": id })}
      onClick={() => setOpen((current) => !current)}
    >
      <PanelLeftOpen />
      <span className="min-w-0 truncate">
        {/* The sheet closes itself, so only the desktop disclosure ever says so. */}
        {open && device === "desktop" ? hideLabel : label}
      </span>
    </Button>
  );

  if (device === "mobile") {
    return (
      // `min-w-0`: this is a grid item, and a grid item's `min-width: auto`
      // lets it grow to fit its widest child rather than shrink. Without it
      // the button's `max-w-full` resolves against a box that has already
      // widened to the whole label, and a long section title scrolls the page
      // sideways instead of being truncated.
      <div className="min-w-0">
        {toggle}
        <Sheet
          open={open}
          onOpenChange={setOpen}
          // Not `onOpenChange`: that fires when the close starts, while the
          // sheet still holds the page. See `close` above.
          onOpenChangeComplete={(nowOpen) => {
            if (nowOpen) return;
            setAfterClose(null);
            afterClose?.();
          }}
        >
          <SheetContent side="left" className="w-[85%] gap-0 p-0">
            <SheetHeader className="px-4 pt-4 pb-3">
              <SheetTitle>{title}</SheetTitle>
              <SheetDescription>{description}</SheetDescription>
            </SheetHeader>
            {/* Outside the scrolling body on purpose: search is the reason the
                rail is usable at this length, and a search box that leaves the
                viewport as the results scroll is the defect this replaces. */}
            <div className="border-b border-[var(--line)] px-4 pb-3">
              {searchBox}
            </div>
            {/* `min-h-0` is what lets this shrink inside the sheet's flex
                column; without it the body grows past the sheet and the page
                behind it scrolls instead of the list. */}
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4">
              {body}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      {toggle}
      <div
        id={id}
        className={cn(
          // Clears the portal's own sticky header. The underscores are
          // Tailwind's spaces: `calc(a+b)` without them is invalid CSS and
          // silently drops the offset, which leaves the rail scrolling away.
          "space-y-6 lg:sticky lg:top-[calc(var(--portal-header-height)_+_1.5rem)] lg:block",
          // A rail this long is taller than the viewport, and a sticky box
          // taller than its viewport puts its own foot out of reach. It
          // scrolls itself instead.
          "lg:max-h-[calc(100vh_-_var(--portal-header-height)_-_3rem)] lg:overflow-y-auto",
          !open && "hidden",
        )}
      >
        {searchBox}
        {body}
      </div>
    </div>
  );
}

/**
 * The frame around a rail's search results: how many there are, or that there
 * are none. The rows themselves are the caller's -- a slot of site copy and an
 * event section carry different things -- but the count line is the same
 * sentence in both and reads better staying that way.
 */
export function PortalRailResults({
  count,
  noun,
  children,
}: {
  count: number;
  /** Singular; pluralized with an `s`. */
  noun: string;
  children: ReactNode;
}) {
  return (
    <nav aria-label="Search results">
      <p className="app-muted mb-2 text-xs">
        {count === 0
          ? "Nothing matches."
          : `${count} ${noun}${count === 1 ? "" : "s"}`}
      </p>
      {children}
    </nav>
  );
}
