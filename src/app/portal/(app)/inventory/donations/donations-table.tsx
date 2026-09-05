"use client";

import Link from "next/link";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LinkPendingPulse } from "@/components/link-pending";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { donorLabel, type DonationRow } from "./donation-shared";
import { formatInstantDate } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";
import { SortHeaderLink } from "@/components/portal/sort-header-link";

/**
 * Only the date sorts.
 *
 * Donor, Items and Source event all read through an embed -- `donor:people`,
 * the to-many `inventory_items`, `event:events` -- and PostgREST cannot order
 * parent rows by an embedded resource's column. Sorting them server-side
 * needs a view that flattens the donor onto the row, the way
 * `inventory_items_with_category` was added so Category could sort. Sorting
 * only what is on the page here would reorder a page rather than the list,
 * which reads as a bug.
 */
export function DonationsTable({
  donations,
  hasActiveFilters,
  dir,
  sortHref,
}: {
  donations: DonationRow[];
  hasActiveFilters: boolean;
  /** Direction of the date sort, which is the only sort there is. */
  dir: "asc" | "desc";
  sortHref: string;
}) {
  if (donations.length === 0) {
    return (
      <Card>
        <CardContent className="px-0">
          {hasActiveFilters ? (
            <EmptyState
              title="No donations match your filters"
              description="Clear or loosen the filters to see more."
            />
          ) : (
            <EmptyState
              title="No donations recorded yet"
              description="Record the first one with Add donation above."
            />
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="px-0">
        <Table stickyHeader="page">
          <TableHeader>
            <TableRow>
              <TableHead>Donor</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Source event</TableHead>
              <TableHead sortDirection={dir}>
                <SortHeaderLink
                  href={sortHref}
                  label="Date received"
                  dir={dir}
                />
              </TableHead>
              <TableHead className="w-0">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {donations.map((donation) => {
              const itemSummary = donation.inventory_items
                .map((item) => item.description)
                .join(", ");
              return (
                <TableRow key={donation.id}>
                  <TableCell>{donorLabel(donation.donor)}</TableCell>
                  <TableCell
                    className="max-w-xs whitespace-normal"
                    title={itemSummary}
                  >
                    {donation.inventory_items.length === 0
                      ? "—"
                      : `${donation.inventory_items.length} item${donation.inventory_items.length === 1 ? "" : "s"} · ${itemSummary}`}
                  </TableCell>
                  <TableCell>{donation.event?.name ?? "—"}</TableCell>
                  <TableCell>
                    {formatInstantDate(donation.donated_at)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      nativeButton={false}
                      aria-label="View donation"
                      render={
                        <Link
                          href={`/portal/inventory/donations/${donation.id}`}
                        />
                      }
                    >
                      <LinkPendingPulse>
                        <Eye />
                      </LinkPendingPulse>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
