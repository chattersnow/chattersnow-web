"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DonationSheet } from "./donation-sheet";
import { dateFormatter, donorLabel, type DonationRow } from "./donation-shared";

export function DonationsTable({
  donations,
  hasActiveFilters,
}: {
  donations: DonationRow[];
  hasActiveFilters: boolean;
}) {
  if (donations.length === 0) {
    return (
      <Card>
        <CardContent className="px-0">
          <p className="app-muted px-4 py-6 text-sm">
            {hasActiveFilters
              ? "No donations match your filters."
              : "No donations recorded yet."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Donor</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Source event</TableHead>
              <TableHead>Date received</TableHead>
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
                    {dateFormatter.format(new Date(donation.donated_at))}
                  </TableCell>
                  <TableCell>
                    <DonationSheet donation={donation} />
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
