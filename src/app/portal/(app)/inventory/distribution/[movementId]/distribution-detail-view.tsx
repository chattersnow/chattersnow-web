import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import { EditDistributionSheet } from "./edit-distribution-sheet";
import { DeleteDistributionButton } from "./delete-distribution-button";

export type DistributionDetailRow = {
  id: string;
  quantity: number;
  occurred_at: string;
  reason: string | null;
  inventory_item: {
    id: string;
    description: string;
    type: string;
    size: string | null;
  } | null;
  event: { id: string; name: string } | null;
  recipient: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function DistributionDetailView({
  movement,
  canManage,
}: {
  movement: DistributionDetailRow;
  canManage: boolean;
}) {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            {movement.inventory_item?.description ?? "Distribution"}
          </h1>
          <p className="app-muted mt-2 text-sm">
            Distributed {dateFormatter.format(new Date(movement.occurred_at))}
          </p>
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-2">
            <EditDistributionSheet movement={movement} />
            <DeleteDistributionButton
              movementId={movement.id}
              itemDescription={
                movement.inventory_item?.description ?? "this distribution"
              }
            />
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="app-muted text-sm font-semibold">
              Distribution details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <ReadOnlyField label="Item" htmlFor="distribution-item-view">
                {movement.inventory_item?.description ?? "—"}
              </ReadOnlyField>
              <ReadOnlyField
                label="Item type"
                htmlFor="distribution-item-type-view"
              >
                {movement.inventory_item?.type ?? "—"}
              </ReadOnlyField>
              <ReadOnlyField label="Size" htmlFor="distribution-size-view">
                {movement.inventory_item?.size || "—"}
              </ReadOnlyField>
              <ReadOnlyField
                label="Quantity"
                htmlFor="distribution-quantity-view"
              >
                {movement.quantity}
              </ReadOnlyField>
              <ReadOnlyField
                label="Date & time"
                htmlFor="distribution-occurred-at-view"
              >
                {dateFormatter.format(new Date(movement.occurred_at))}
              </ReadOnlyField>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="app-muted text-sm font-semibold">
              Event, recipient & notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <ReadOnlyField label="Event" htmlFor="distribution-event-view">
                {movement.event?.name ?? "—"}
              </ReadOnlyField>
              <ReadOnlyField
                label="Recipient"
                htmlFor="distribution-recipient-view"
              >
                {movement.recipient?.name || "—"}
              </ReadOnlyField>
              <ReadOnlyField
                label="Reason / notes"
                htmlFor="distribution-reason-view"
              >
                {movement.reason || "—"}
              </ReadOnlyField>
            </FieldGroup>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
