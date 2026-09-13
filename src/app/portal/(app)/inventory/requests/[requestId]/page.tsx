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
import { PortalBreadcrumbs } from "@/components/portal/breadcrumbs";
import { Card, CardContent } from "@/components/ui/card";
import {
  GearRequestDetailView,
  type GearRequestDetailRow,
} from "./request-detail-view";

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
  const [permissions, lexicon] = await Promise.all([
    getCurrentUserPermissions(supabase),
    getTenantLexicon(supabase),
  ]);
  const canManage = hasPermission(permissions, "inventory", "manage");

  const [{ data: request, error }, settingsResult] = await Promise.all([
    supabase
      .from("gear_requests")
      .select(REQUEST_SELECT)
      .eq("id", requestId)
      .maybeSingle(),
    // Only to name the payment method the requester chose: the request
    // stores the key, the setting holds the label.
    supabase.rpc("get_gear_request_settings"),
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

  return (
    <>
      <PortalBreadcrumbs current={requestTitle(row)} />
      <GearRequestDetailView
        request={row}
        paymentMethods={settings.paymentMethods}
        canManage={canManage}
        lexicon={lexicon}
      />
    </>
  );
}
