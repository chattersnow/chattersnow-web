import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { PortalBreadcrumbs } from "@/components/portal/breadcrumbs";
import { Card, CardContent } from "@/components/ui/card";
import type { ItemHistoryRow } from "../../items/[itemId]/item-history";
import { acknowledgementFromHistory } from "./acknowledgement";
import {
  DistributionDetailView,
  type DistributionDetailRow,
} from "./distribution-detail-view";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ movementId: string }>;
}): Promise<Metadata> {
  const { movementId } = await params;
  // Titled by the item distributed -- a joined relation, so not the shared
  // detailTitle helper.
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("inventory_movements")
    .select("inventory_item:inventory_items(description)")
    .eq("id", movementId)
    .eq("movement_type", "distributed")
    .maybeSingle<{ inventory_item: { description: string | null } | null }>();
  const description = data?.inventory_item?.description?.trim();
  return {
    title: description ? `${description} distribution` : "Distribution",
  };
}

export default async function DistributionDetailPage({
  params,
}: {
  params: Promise<{ movementId: string }>;
}) {
  const { movementId } = await params;
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "inventory", "manage");

  const [{ data: movement, error }, { data: events }] = await Promise.all([
    supabase
      .from("inventory_movements")
      .select(
        "id, quantity, occurred_at, reason, inventory_item:inventory_items(id, description, type, size, inventory_categories(key, label)), event:events(id, name), recipient:people(id, name, email, phone)",
      )
      .eq("id", movementId)
      .eq("movement_type", "distributed")
      .maybeSingle(),
    // A capped, newest-first list for the edit sheet's event picker, the
    // same one the donation detail page uses.
    canManage
      ? supabase
          .from("events")
          .select("id, name")
          .order("starts_at", { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [] }),
  ]);

  if (error) {
    return (
      <Card>
        <CardContent className="app-muted text-sm">
          Could not load this distribution. Please try again.
        </CardContent>
      </Card>
    );
  }
  if (!movement) notFound();

  const itemId = (movement as unknown as DistributionDetailRow).inventory_item
    ?.id;
  // The item's history resolves the as-is acknowledgement (#1519), including
  // one carried by the gear request the handout fulfilled.
  const { data: history } = itemId
    ? await supabase
        .rpc("inventory_item_history", { p_item_id: itemId })
        .overrideTypes<ItemHistoryRow[], { merge: false }>()
    : { data: null };

  return (
    <>
      <PortalBreadcrumbs
        current={
          (movement as unknown as DistributionDetailRow).inventory_item
            ?.description ?? "Distribution"
        }
      />

      <DistributionDetailView
        movement={movement as unknown as DistributionDetailRow}
        acknowledgement={acknowledgementFromHistory(history, movementId)}
        canManage={canManage}
        events={events ?? []}
      />
    </>
  );
}
