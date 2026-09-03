"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { LinkPendingPulse } from "@/components/link-pending";

type SortDirection = "asc" | "desc" | null;

/**
 * The label and direction indicator shared by both sort headers.
 *
 * There were two unrelated implementations of the same affordance -- one
 * URL-driven, one local `useState` -- so the icon set and hover treatment
 * were maintained twice.
 */
function SortLabel({ label, dir }: { label: string; dir: SortDirection }) {
  return (
    <>
      {label}
      {dir === null ? (
        <ArrowUpDown className="size-3.5 text-muted-foreground" />
      ) : dir === "asc" ? (
        <ArrowUp className="size-3.5" />
      ) : (
        <ArrowDown className="size-3.5" />
      )}
    </>
  );
}

/**
 * Composed as a single label rather than an adjacent sr-only span: element
 * boundaries insert whitespace into the computed name, so the span version
 * announced "Amount , sorted descending".
 */
function sortLabelText(label: string, dir: SortDirection) {
  if (dir === null) return `${label}, not sorted`;
  return `${label}, sorted ${dir === "asc" ? "ascending" : "descending"}`;
}

/**
 * Column-header sort control for tables that sort server-side through the
 * URL, so the sort survives a reload and can be shared. Prefer this: the
 * button variant below loses its sort on any navigation.
 */
export function SortHeaderLink({
  href,
  label,
  dir,
}: {
  href: string;
  label: string;
  /** Sort direction when this column is the active sort, null otherwise. */
  dir: SortDirection;
}) {
  return (
    <Link
      href={href}
      aria-label={sortLabelText(label, dir)}
      className="inline-flex items-center gap-1 hover:text-foreground"
    >
      <LinkPendingPulse>
        <SortLabel label={label} dir={dir} />
      </LinkPendingPulse>
    </Link>
  );
}

/**
 * Same affordance for the two tables that sort a client-held array. Same
 * semantics as the link version otherwise, including the announced state.
 */
export function SortHeaderButton({
  label,
  dir,
  onSort,
}: {
  label: string;
  dir: SortDirection;
  onSort: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSort}
      aria-label={sortLabelText(label, dir)}
      className="inline-flex items-center gap-1 hover:text-foreground"
    >
      <SortLabel label={label} dir={dir} />
    </button>
  );
}
