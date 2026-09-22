import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, personDisplayName } from "@/lib/format";
import {
  deliveryMethodLabel,
  isOpenGearRequest,
  shippingAddressLines,
  type PaymentMethod,
} from "@/lib/gear-requests";
import type { Lexicon } from "@/lib/lexicon";
import { GearRequestStatusBadge } from "../request-status-badge";
import { GearRequestStatusActions } from "./request-status-actions";
import {
  messagingDisabledReason,
  type MessageActor,
  type RecordMessageRow,
} from "@/lib/outbound-messages";
import { RequestMessagesCard } from "./request-messages-card";
import { ViewerTime } from "@/components/viewer-time";
import { instagramUrl } from "@/components/instagram-link";

export type GearRequestDetailRow = {
  id: string;
  status: string;
  delivery_method: string;
  ship_name: string | null;
  ship_line1: string | null;
  ship_line2: string | null;
  ship_city: string | null;
  ship_region: string | null;
  ship_postal_code: string | null;
  ship_country: string | null;
  payment_method: string | null;
  notes: string | null;
  quoted_amount: number | string | null;
  quoted_at: string | null;
  paid_at: string | null;
  fulfilled_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  as_is_acknowledged_at: string | null;
  as_is_text: string | null;
  requester: {
    id: string;
    name: string | null;
    preferred_name: string | null;
    email: string | null;
    phone: string | null;
    instagram_handle: string | null;
  } | null;
  movements: {
    id: string;
    movement_type: string;
    inventory_item: {
      id: string;
      description: string;
      size: string | null;
      status: string;
      category_label: { label: string } | null;
    } | null;
  }[];
};

/**
 * What an item's own status says about this request's hold on it. The
 * request does not track per-item progress; the item does, through the
 * ordinary distribution flow.
 */
function itemProgress(status: string): string {
  switch (status) {
    case "reserved":
      return "On hold";
    case "distributed":
      return "Handed over";
    case "available":
      return "Released";
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

export function GearRequestDetailView({
  request,
  paymentMethods,
  canManage,
  lexicon,
  messages,
  messageActors,
  orgName,
  replyTo,
  orgEmailEnabled,
}: {
  request: GearRequestDetailRow;
  paymentMethods: PaymentMethod[];
  canManage: boolean;
  lexicon: Lexicon;
  messages: RecordMessageRow[];
  messageActors: MessageActor[];
  orgName: string;
  replyTo: string | null;
  orgEmailEnabled: boolean;
}) {
  const requesterName = personDisplayName(
    request.requester,
    "an anonymized requester",
  );
  const shipping = request.delivery_method === "shipping";
  const addressLines = shippingAddressLines({
    name: request.ship_name,
    line1: request.ship_line1,
    line2: request.ship_line2,
    city: request.ship_city,
    region: request.ship_region,
    postal_code: request.ship_postal_code,
    country: request.ship_country,
  });
  const paymentMethod =
    paymentMethods.find((method) => method.key === request.payment_method) ??
    null;
  const items = request.movements
    .filter((movement) => movement.movement_type === "reserved")
    .map((movement) => movement.inventory_item)
    .filter((item): item is NonNullable<typeof item> => item !== null);
  const heldCount = items.filter((item) => item.status === "reserved").length;

  return (
    <>
      <div>
        <div className="w-fit">
          <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
            Request from {requesterName}
          </h1>
          <div className="rainbow-accent mt-3 w-full" />
        </div>
        <p className="app-muted mt-2 flex flex-wrap items-center gap-2 text-sm">
          <GearRequestStatusBadge status={request.status} />
          <span>
            Requested <ViewerTime iso={request.created_at} fallbackZone="UTC" />
          </span>
        </p>
      </div>

      {canManage && isOpenGearRequest(request.status) && (
        <GearRequestStatusActions
          requestId={request.id}
          status={request.status}
          deliveryMethod={request.delivery_method}
          heldCount={heldCount}
        />
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="app-muted text-sm font-semibold">
              Delivery
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <ReadOnlyField label="Method" htmlFor="request-delivery-method">
                {deliveryMethodLabel(request.delivery_method)}
              </ReadOnlyField>
              {shipping && (
                <>
                  <ReadOnlyField
                    label="Ship to"
                    htmlFor="request-shipping-address"
                  >
                    {addressLines.length > 0 ? (
                      <span className="whitespace-pre-line">
                        {addressLines.join("\n")}
                      </span>
                    ) : (
                      "Address removed"
                    )}
                  </ReadOnlyField>
                  <ReadOnlyField
                    label="Postage paid by"
                    htmlFor="request-payment-method"
                  >
                    {paymentMethod?.label ??
                      request.payment_method ??
                      "Not recorded"}
                  </ReadOnlyField>
                  <ReadOnlyField label="Postage" htmlFor="request-quote">
                    {request.quoted_amount === null ? (
                      "Not quoted yet"
                    ) : (
                      <>
                        {`${formatCurrency(request.quoted_amount)} quoted `}
                        <ViewerTime
                          iso={request.quoted_at}
                          fallbackZone="UTC"
                        />
                      </>
                    )}
                  </ReadOnlyField>
                  <ReadOnlyField label="Paid" htmlFor="request-paid">
                    {request.paid_at ? (
                      <ViewerTime iso={request.paid_at} fallbackZone="UTC" />
                    ) : (
                      "Not yet"
                    )}
                  </ReadOnlyField>
                </>
              )}
              {request.fulfilled_at && (
                <ReadOnlyField label="Fulfilled" htmlFor="request-fulfilled">
                  <ViewerTime iso={request.fulfilled_at} fallbackZone="UTC" />
                </ReadOnlyField>
              )}
              {request.cancelled_at && (
                <ReadOnlyField label="Cancelled" htmlFor="request-cancelled">
                  <ViewerTime iso={request.cancelled_at} fallbackZone="UTC" />
                </ReadOnlyField>
              )}
              {/* What the requester was told, and when they said they
                  understood it (#1367). Read-only and gating nothing: the
                  request carries the record, so recording a distribution
                  against it needs no second capture.

                  **Distribution outside a request is deliberately untouched.**
                  `inventory_movements.gear_request_id` is nullable -- gear
                  handed out at an event never passed through the public form
                  -- and making that path capture something would mean a
                  staffer attesting on a recipient's behalf, which is the shape
                  this was built to avoid. Null here is a request from before
                  this shipped, or gear that never came through the cart. */}
              <ReadOnlyField label="Given as-is" htmlFor="request-as-is">
                {request.as_is_acknowledged_at ? (
                  <>
                    {"Acknowledged "}
                    <ViewerTime
                      iso={request.as_is_acknowledged_at}
                      fallbackZone="UTC"
                    />
                    {request.as_is_text && (
                      // The wording as it stood that day, not as it reads now.
                      // It is the whole point of the snapshot, so it is shown
                      // rather than hidden behind a disclosure: a staffer
                      // answering "what were they told" should not have to
                      // click for it.
                      <p className="app-muted mt-2 text-sm whitespace-pre-line">
                        {request.as_is_text}
                      </p>
                    )}
                  </>
                ) : (
                  "Not recorded — this request predates the acknowledgement"
                )}
              </ReadOnlyField>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="app-muted text-sm font-semibold">
              Requester
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <ReadOnlyField label="Name" htmlFor="request-requester-name">
                {request.requester ? (
                  <Link
                    href={`/portal/people/${request.requester.id}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {requesterName}
                  </Link>
                ) : (
                  "Anonymized"
                )}
              </ReadOnlyField>
              <ReadOnlyField label="Email" htmlFor="request-requester-email">
                {request.requester?.email ?? "—"}
              </ReadOnlyField>
              <ReadOnlyField label="Phone" htmlFor="request-requester-phone">
                {request.requester?.phone ?? "—"}
              </ReadOnlyField>
              {/* Often the only identifier that reaches a requester (#1357),
                  so it is a link: staff read this page to get in touch. */}
              <ReadOnlyField
                label="Instagram"
                htmlFor="request-requester-instagram"
              >
                {request.requester?.instagram_handle ? (
                  <a
                    href={instagramUrl(request.requester.instagram_handle)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline-offset-2 hover:underline"
                  >
                    @{request.requester.instagram_handle}
                  </a>
                ) : (
                  "—"
                )}
              </ReadOnlyField>
              <ReadOnlyField label="Notes" htmlFor="request-notes">
                {request.notes ? (
                  // The public form's Notes is a textarea, and the RPC only
                  // trims, so the text arrives with the line breaks typed.
                  <span className="whitespace-pre-line">{request.notes}</span>
                ) : (
                  "—"
                )}
              </ReadOnlyField>
            </FieldGroup>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="app-muted text-sm font-semibold">
            {lexicon.item_plural} requested
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{lexicon.item}</TableHead>
                <TableHead hideBelow="sm">Category</TableHead>
                <TableHead hideBelow="sm">Size</TableHead>
                <TableHead>Progress</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="app-muted text-sm">
                    No items are linked to this request.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.description}
                    </TableCell>
                    <TableCell hideBelow="sm" className="app-muted">
                      {item.category_label?.label ?? "—"}
                    </TableCell>
                    <TableCell hideBelow="sm" className="app-muted">
                      {item.size ?? "—"}
                    </TableCell>
                    <TableCell>{itemProgress(item.status)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <p className="app-muted mt-3 text-xs">
        Handing an item over is recorded through Distribution, as for any other
        item; it shows here as &ldquo;Handed over&rdquo;. Mark the request
        fulfilled once everything in it is out.
      </p>

      {canManage && (
        <RequestMessagesCard
          requestId={request.id}
          messages={messages}
          actors={messageActors}
          recipientName={requesterName}
          toEmail={request.requester?.email ?? ""}
          orgName={orgName}
          replyTo={replyTo}
          disabledReason={messagingDisabledReason(
            orgEmailEnabled,
            request.requester?.email,
            "This request has no email address — the requester's record was cleared or never carried one.",
          )}
        />
      )}
    </>
  );
}
