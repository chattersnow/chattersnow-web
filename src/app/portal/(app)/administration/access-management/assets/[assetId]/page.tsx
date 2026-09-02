import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { humanize } from "../../labels";
import {
  getAssetDetail,
  listAccessGrantsForAsset,
  listPeopleForAccessManagement,
  listServices,
} from "../../queries";
import { AccessGrantsTable } from "./access-grants-table";
import { AssetAuditHistory } from "./asset-audit-history";
import { AssetDetailsCard, AssetSecurityCard } from "./asset-details-cards";
import { NewAccessGrantDialog } from "./new-access-grant-dialog";
import { ReviewAssetButton } from "./review-asset-button";
import { DeleteAssetButton } from "../../delete-asset-button";

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  const { assetId } = await params;
  const supabase = await createSupabaseServerClient();

  const [assetResult, grantsResult, servicesResult, peopleResult] =
    await Promise.all([
      getAssetDetail(supabase, assetId),
      listAccessGrantsForAsset(supabase, assetId),
      listServices(supabase),
      listPeopleForAccessManagement(supabase),
    ]);

  if ("error" in assetResult) {
    if (assetResult.error === "Asset not found.") notFound();
    return (
      <Card>
        <CardContent className="app-muted text-sm">
          {assetResult.error}
        </CardContent>
      </Card>
    );
  }

  const asset = assetResult.data;
  const services = "error" in servicesResult ? [] : servicesResult.data;
  const people = "error" in peopleResult ? [] : peopleResult.data;
  const grants = "error" in grantsResult ? [] : grantsResult.data;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        nativeButton={false}
        className="mb-2"
        render={<Link href="/portal/administration/access-management" />}
      >
        <ArrowLeft /> Access management
      </Button>
      <div>
        <div className="w-fit">
          <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            {asset.name}
          </h1>
          <div className="rainbow-accent mt-3 w-full" />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant="outline">{asset.service?.name ?? "—"}</Badge>
          <Badge variant="outline" className="capitalize">
            {humanize(asset.category)}
          </Badge>
          <Badge variant="secondary" className="capitalize">
            {asset.sensitivity}
          </Badge>
          <Badge variant="outline" className="capitalize">
            {asset.status}
          </Badge>
        </div>
      </div>

      <div className="rainbow-surface mt-6 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-[var(--line)] p-4 shadow-md">
        <ReviewAssetButton assetId={asset.id} sensitivity={asset.sensitivity} />
        <DeleteAssetButton
          assetId={asset.id}
          assetName={asset.name}
          activeGrantCount={
            grants.filter((grant) => grant.status === "active").length
          }
          variant="button"
          redirectTo="/portal/administration/access-management"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <AssetDetailsCard asset={asset} services={services} people={people} />
        <AssetSecurityCard asset={asset} people={people} />
      </div>

      <div className="mt-6 flex items-center justify-between">
        <h2 className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
          Access grants
        </h2>
        <NewAccessGrantDialog assetId={asset.id} people={people} />
      </div>
      <div className="mt-3">
        <AccessGrantsTable grants={grants} assetId={asset.id} />
      </div>

      <div className="mt-6">
        <AssetAuditHistory supabase={supabase} assetId={asset.id} />
      </div>
    </>
  );
}
