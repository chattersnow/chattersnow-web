"use client";

import {
  listEventDonationsAction,
  type EventDonationRow,
} from "../home/actions";
import { AddDonationModal } from "../home/add-donation-modal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useTabData } from "@/hooks/use-tab-data";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatValue(value: number | string | null) {
  if (value === null || value === undefined) return "—";
  const numeric = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(numeric) ? currencyFormatter.format(numeric) : "—";
}

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export function DonationsTab({
  eventId,
  active,
  mode,
}: {
  eventId: string;
  active: boolean;
  mode: "view" | "edit";
}) {
  const {
    data: donations,
    loadError,
    refresh,
  } = useTabData<EventDonationRow[]>(
    () => listEventDonationsAction(eventId),
    active,
    [eventId],
  );

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

      {mode === "edit" && (
        <AddDonationModal
          triggerLabel="Record donation for this event"
          eventId={eventId}
          onSaved={refresh}
        />
      )}

      {donations === undefined ? (
        <p className="app-muted text-sm">Loading donations...</p>
      ) : items.length === 0 ? (
        <p className="app-muted text-sm">
          No donations recorded for this event yet.
        </p>
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
                <TableCell className="font-medium">
                  {item.description}
                  <span className="app-muted block text-xs">{item.type}</span>
                </TableCell>
                <TableCell className="app-muted">{item.donorLabel}</TableCell>
                <TableCell className="app-muted capitalize">
                  {item.condition.replace("_", " ")}
                </TableCell>
                <TableCell>{formatValue(item.face_value)}</TableCell>
                <TableCell className="app-muted">
                  {dateFormatter.format(new Date(item.donatedAt))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
