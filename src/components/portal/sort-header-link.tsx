"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { LinkPendingPulse } from "@/components/link-pending";

/**
 * Column-header sort link for portal tables: label + sort-direction icon,
 * with inline pending feedback while the sort navigation is in flight.
 */
export function SortHeaderLink({
  href,
  label,
  dir,
}: {
  href: string;
  label: string;
  /** Sort direction when this column is the active sort, null otherwise. */
  dir: "asc" | "desc" | null;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 hover:text-foreground"
    >
      <LinkPendingPulse>
        {label}
        {dir === null ? (
          <ArrowUpDown className="size-3.5 text-muted-foreground" />
        ) : dir === "asc" ? (
          <ArrowUp className="size-3.5" />
        ) : (
          <ArrowDown className="size-3.5" />
        )}
      </LinkPendingPulse>
    </Link>
  );
}
