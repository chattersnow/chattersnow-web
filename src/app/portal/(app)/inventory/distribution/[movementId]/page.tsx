import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DistributionDetailView,
  type DistributionDetailRow,
} from "./distribution-detail-view";

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
      <div className="rainbow-accent w-16" />
      <Button
        variant="ghost"
        size="sm"
        nativeButton={false}
        className="mb-2"
        render={<Link href="/portal/inventory/distribution" />}
      >
        <ArrowLeft /> Distribution
      </Button>

      <DistributionDetailView
        movement={movement as unknown as DistributionDetailRow}
        canManage={canManage}
      />
    </>
  );
}
