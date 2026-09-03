import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { PortalBreadcrumbs } from "@/components/portal/breadcrumbs";
import { Card, CardContent } from "@/components/ui/card";
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

  const { data: movement, error } = await supabase
    .from("inventory_movements")
    .select(
      "id, quantity, occurred_at, reason, inventory_item:inventory_items(id, description, type, size), event:events(id, name), recipient:people(id, name, email, phone)",
    )
    .eq("id", movementId)
    .eq("movement_type", "distributed")
    .maybeSingle();

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
        canManage={canManage}
      />
    </>
  );
}
