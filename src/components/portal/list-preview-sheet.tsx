"use client";

import { useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/** Rows a card shows before it defers the rest to the sheet. */
export const LIST_PREVIEW_ROWS = 5;

/**
 * "View all N ..." -- the overflow half of a capped list.
 *
 * The event phase grid stacks its sections two-up, so one uncapped list (a
 * twenty-person registrant table runs past 1600px) buries every card beside
 * and below it. Cards now render `LIST_PREVIEW_ROWS` rows and hand the rest to
 * this sheet.
 *
 * Progressive disclosure normally defers *secondary* content, and a registrant
 * list is the primary content of its own tab -- so the deal only works if the
 * sheet is strictly better than the card at the task the card was bad at.
 * Hence: the caller's real rows with their real row actions (not a read-only
 * copy), the same toolbar via `actions`, and search. Search is the part that
 * pays for the extra click, because finding one person by scanning was always
 * the slow path.
 */
export function ListPreviewSheet({
  title,
  description,
  triggerLabel,
  searchPlaceholder,
  searchLabel = "Search",
  query = "",
  onQueryChange,
  totalCount,
  filteredCount,
  actions,
  size = "2xl",
  children,
}: {
  title: string;
  /** Usually the card's own summary line, so context survives the overlay. */
  description?: ReactNode;
  triggerLabel: string;
  /** Omit to render the sheet without a filter box. */
  searchPlaceholder?: string;
  searchLabel?: string;
  query?: string;
  onQueryChange?: (next: string) => void;
  totalCount?: number;
  filteredCount?: number;
  actions?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  function handleOpenChange(next: boolean) {
    // A stale filter would otherwise be waiting the next time it opens, with
    // the input scrolled out of view above the rows it is hiding.
    if (!next) onQueryChange?.("");
    setOpen(next);
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger
        render={<Button type="button" variant="ghost" className="w-full" />}
      >
        {triggerLabel}
      </SheetTrigger>
      <SheetContent side="right" size={size}>
        <SheetHeader className="flex-row items-start justify-between gap-3 pr-12">
          <div className="flex flex-col gap-0.5">
            <SheetTitle>{title}</SheetTitle>
            {description && <SheetDescription>{description}</SheetDescription>}
          </div>
          {actions && (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {actions}
            </div>
          )}
        </SheetHeader>

        {searchPlaceholder && (
          <div className="flex flex-col gap-1 px-4">
            <div className="relative">
              <Search className="app-muted pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                type="search"
                aria-label={searchLabel}
                placeholder={searchPlaceholder}
                value={query}
                onChange={(event) => onQueryChange?.(event.target.value)}
                className="pl-8"
              />
            </div>
            <p role="status" className="app-muted text-xs">
              Showing {filteredCount} of {totalCount}
            </p>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
