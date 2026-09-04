"use client";

import { categoryLabelFor, flattenCategory } from "@/lib/inventory";
import {
  listEventDonationsAction,
  type EventDonationRow,
} from "../home/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useTabData } from "@/hooks/use-tab-data";
import { useRegisterTabRefresh } from "@/hooks/use-tab-refresh";
import type { TabValue } from "./event-tabs-config";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import { formatCurrency, formatInstantDate } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";

export function DonationsTab({
  eventId,
}: {
  eventId: string;
  mode: "view" | "edit";
}) {
  const {
    data: donations,
    loadError,
    refresh,
  } = useTabData<EventDonationRow[]>(
    () => listEventDonationsAction(eventId),
    [eventId],
  );

  useRegisterTabRefresh<TabValue>("donations", refresh);

  const items = (donations ?? []).flatMap((donation) =>
    donation.inventory_items.map((item) => ({
      ...item,
      donatedAt: donation.donated_at,
      donorLabel: donation.donor?.is_anonymous
        ? "Anonymous"
        : donation.donor?.name || "—",
    })),
  );

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {donations === undefined ? (
        <TabLoadingSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          title="No donations recorded for this event yet"
          description="Add the first one with Record donation for this event above."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Donor</TableHead>
              <TableHead>Condition</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="max-w-xs font-medium">
                  <span className="block truncate" title={item.description}>
                    {item.description}
                  </span>
                  <span className="app-muted block text-xs">
                    {categoryLabelFor(flattenCategory(item))}
                  </span>
                </TableCell>
                <TableCell className="app-muted">{item.donorLabel}</TableCell>
                <TableCell className="app-muted capitalize">
                  {item.condition.replace("_", " ")}
                </TableCell>
                <TableCell>{formatCurrency(item.face_value)}</TableCell>
                <TableCell className="app-muted">
                  {formatInstantDate(item.donatedAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
