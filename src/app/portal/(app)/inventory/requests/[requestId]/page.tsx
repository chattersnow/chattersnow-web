import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { getTenantLexicon } from "@/lib/tenant-lexicon";
import { personDisplayName } from "@/lib/format";
import { parseGearRequestSettings } from "@/lib/gear-requests";
import { getOrgEmailEnabled } from "@/lib/notifications/settings";
import { getTenantContext } from "@/lib/portal/tenants";
import { GEAR_REQUEST_RECORD_TYPE } from "@/lib/outbound-messages";
import { PortalBreadcrumbs } from "@/components/portal/breadcrumbs";
import { Card, CardContent } from "@/components/ui/card";
import {
  GearRequestDetailView,
  type GearRequestDetailRow,
} from "./request-detail-view";
import type { MessageActor, RequestMessageRow } from "./request-messages-card";

const REQUEST_SELECT =
  "id, status, delivery_method, ship_name, ship_line1, ship_line2, ship_city, ship_region, ship_postal_code, ship_country, payment_method, notes, quoted_amount, quoted_at, paid_at, fulfilled_at, cancelled_at, created_at, requester:people(id, name, preferred_name, email, phone), movements:inventory_movements(id, movement_type, inventory_item:inventory_items(id, description, size, status, category_label:inventory_categories(label)))";

function requestTitle(row: GearRequestDetailRow | null): string {
  return row
    ? `Request from ${personDisplayName(row.requester, "an anonymized requester")}`
    : "Request";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ requestId: string }>;
}): Promise<Metadata> {
  const { requestId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("gear_requests")
    .select("id, requester:people(name, preferred_name, email)")
    .eq("id", requestId)
    .maybeSingle();
  return {
    title: requestTitle((data as unknown as GearRequestDetailRow) ?? null),
  };
}

export default async function GearRequestDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;
  const supabase = await createSupabaseServerClient();
  const [permissions, lexicon, tenantContext] = await Promise.all([
    getCurrentUserPermissions(supabase),
    getTenantLexicon(supabase),
    // Only for what the composer calls the organization in its default
    // subject. Memoized per request, so the shell has already paid for it.
    getTenantContext(supabase),
  ]);
  const orgName =
    tenantContext.tenants.find(
      (tenant) => tenant.id === tenantContext.currentTenantId,
    )?.name ?? "";
  const canManage = hasPermission(permissions, "inventory", "manage");

  const [{ data: request, error }, settingsResult, messagesResult, orgMail] =
    await Promise.all([
      supabase
        .from("gear_requests")
        .select(REQUEST_SELECT)
        .eq("id", requestId)
        .maybeSingle(),
      // Only to name the payment method the requester chose: the request
      // stores the key, the setting holds the label.
      supabase.rpc("get_gear_request_settings"),
      // What has been sent to this requester from the portal (#1203). RLS
      // answers with nothing at all unless the reader holds inventory:manage.
      supabase
        .from("outbound_messages")
        .select("id, subject, kind, status, created_at, sent_by")
        .eq("record_type", GEAR_REQUEST_RECORD_TYPE)
        .eq("record_id", requestId)
        .order("created_at", { ascending: false }),
      // The Reply-To the composer quotes, through the view that exists because
      // app_settings itself is closed to an inventory manager.
      supabase
        .from("org_notification_settings")
        .select("reply_to")
        .maybeSingle(),
    ]);

  if (error) {
    return (
      <Card>
        <CardContent className="app-muted text-sm">
          Could not load this request. Please try again.
        </CardContent>
      </Card>
    );
  }
  if (!request) notFound();

  const row = request as unknown as GearRequestDetailRow;
  const settings = parseGearRequestSettings(settingsResult?.data);
  const messages = (messagesResult.data ?? []) as RequestMessageRow[];

  // Names for the senders, and the switch, only where the card will render
  // them. Both are a round trip apiece and neither is worth one for a reader
  // who cannot see the card at all.
  //
  // The lookup is keyed on the *messages*, not on the user ids it returns:
  // it is gated on each row's own module, which is how one function serves
  // every module that adopts this (#1204) without a second gate.
  const messageIds = messages
    .filter((message) => message.sent_by)
    .map((message) => message.id);
  const [actorsResult, orgEmailEnabled] = canManage
    ? await Promise.all([
        messageIds.length
          ? supabase.rpc("list_outbound_message_actors", {
              p_message_ids: messageIds,
            })
          : Promise.resolve({ data: [] as MessageActor[] }),
        getOrgEmailEnabled(supabase),
      ])
    : [{ data: [] as MessageActor[] }, false];

  return (
    <>
      <PortalBreadcrumbs current={requestTitle(row)} />
      <GearRequestDetailView
        request={row}
        paymentMethods={settings.paymentMethods}
        canManage={canManage}
        lexicon={lexicon}
        messages={messages}
        messageActors={(actorsResult.data ?? []) as MessageActor[]}
        orgName={orgName}
        replyTo={orgMail.data?.reply_to ?? null}
        orgEmailEnabled={orgEmailEnabled}
      />
    </>
  );
}
