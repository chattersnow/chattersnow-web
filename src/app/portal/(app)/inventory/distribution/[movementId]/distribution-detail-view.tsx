import Link from "next/link";
import { categoryLabelFor, flattenCategory } from "@/lib/inventory";
import { itemHref } from "../../items/inventory-shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import { EditDistributionSheet } from "./edit-distribution-sheet";
import { DeleteDistributionButton } from "./delete-distribution-button";
import { personDisplayName } from "@/lib/format";
import { ViewerTime } from "@/components/viewer-time";
import {
  acknowledgementMethodPhrase,
  isSkippedReason,
  SKIPPED_REASON_LABELS,
} from "@/lib/distribution-acknowledgement";
import type { DistributionAcknowledgement } from "./acknowledgement";

/** "No phone", or "Other — had to catch a bus". */
function skippedReasonText(acknowledgement: DistributionAcknowledgement) {
  const reason = acknowledgement.skippedReason;
  if (!reason) return null;
  const label = isSkippedReason(reason)
    ? SKIPPED_REASON_LABELS[reason]
    : reason;
  return acknowledgement.skippedNote
    ? `${label} — ${acknowledgement.skippedNote}`
    : label;
}

/** Whether the recipient acknowledged the gear as-is, by what name and how --
 *  or the reason staff recorded the handout without it (#1519). */
function AcknowledgementValue({
  acknowledgement,
}: {
  acknowledgement: DistributionAcknowledgement | null;
}) {
  if (!acknowledgement) return <>Not recorded</>;
  const skipped = skippedReasonText(acknowledgement);
  if (!acknowledgement.acknowledgedAt) {
    return <>{`Not acknowledged: ${skipped}`}</>;
  }
  const how = acknowledgementMethodPhrase(acknowledgement.method);
  return (
    <>
      {"Acknowledged "}
      {how && `${how} `}
      {"on "}
      <ViewerTime iso={acknowledgement.acknowledgedAt} fallbackZone="UTC" />
      <span className="block">
        {`Name typed: ${acknowledgement.typedName ?? "—"}`}
      </span>
      {skipped && (
        // Recorded with a reason, then acknowledged afterwards by emailed link.
        <span className="app-muted block text-sm">
          {`At the handout: ${skipped}`}
        </span>
      )}
    </>
  );
}

export type DistributionDetailRow = {
  id: string;
  quantity: number;
  occurred_at: string;
  reason: string | null;
  inventory_item: {
    id: string;
    description: string;
    type: string | null;
    size: string | null;
    inventory_categories?: { key: string; label: string } | null;
  } | null;
  event: { id: string; name: string } | null;
  recipient: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
};

export function DistributionDetailView({
  movement,
  acknowledgement = null,
  canManage,
}: {
  movement: DistributionDetailRow;
  acknowledgement?: DistributionAcknowledgement | null;
  canManage: boolean;
}) {
  return (
    <>
      <div>
        <div className="w-fit">
          <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
            {movement.inventory_item?.description ?? "Distribution"}
          </h1>
          <div className="rainbow-accent mt-3 w-full" />
        </div>
        <p className="app-muted mt-2 text-sm">
          Distributed{" "}
          <ViewerTime iso={movement.occurred_at} fallbackZone="UTC" />
        </p>
      </div>

      {canManage && (
        <div className="rainbow-surface mt-6 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-[var(--line)] p-4 shadow-md">
          <EditDistributionSheet movement={movement} />
          <DeleteDistributionButton
            movementId={movement.id}
            itemDescription={
              movement.inventory_item?.description ?? "this distribution"
            }
          />
        </div>
      )}

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
                {movement.inventory_item ? (
                  // The item's own page is where its details (face value,
                  // condition, photo) are edited.
                  <Link
                    href={itemHref(movement.inventory_item.id)}
                    className="underline-offset-2 hover:underline"
                  >
                    {movement.inventory_item.description}
                  </Link>
                ) : (
                  "—"
                )}
              </ReadOnlyField>
              <ReadOnlyField
                label="Item category"
                htmlFor="distribution-item-category-view"
              >
                {movement.inventory_item
                  ? categoryLabelFor(flattenCategory(movement.inventory_item))
                  : "—"}
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
                <ViewerTime iso={movement.occurred_at} fallbackZone="UTC" />
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
                {personDisplayName(movement.recipient)}
              </ReadOnlyField>
              <ReadOnlyField
                label="Given as-is"
                htmlFor="distribution-as-is-view"
              >
                <AcknowledgementValue acknowledgement={acknowledgement} />
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
