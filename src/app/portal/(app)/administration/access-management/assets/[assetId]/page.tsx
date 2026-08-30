import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import { FieldGroup } from "@/components/ui/field";
import { humanize } from "../../labels";
import {
  getAssetDetail,
  listAccessGrantsForAsset,
  listPeopleForAccessManagement,
  listServices,
} from "../../queries";
import { AccessGrantsTable } from "./access-grants-table";
import { AssetAuditHistory } from "./asset-audit-history";
import { EditAssetSheet } from "./edit-asset-sheet";
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
        <EditAssetSheet asset={asset} services={services} people={people} />
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
        <Card>
          <CardHeader>
            <CardTitle className="app-muted text-sm font-semibold">
              Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <ReadOnlyField label="URL" htmlFor="asset-detail-url">
                {asset.url || "—"}
              </ReadOnlyField>
              <ReadOnlyField
                label="Description"
                htmlFor="asset-detail-description"
              >
                {asset.description || "—"}
              </ReadOnlyField>
              <ReadOnlyField
                label="Organization-owned"
                htmlFor="asset-detail-org-owned"
              >
                {asset.is_org_owned ? "Yes" : "No"}
              </ReadOnlyField>
              <ReadOnlyField label="Owner" htmlFor="asset-detail-owner">
                {asset.owner?.name ?? "—"}
              </ReadOnlyField>
              <ReadOnlyField
                label="Primary administrator"
                htmlFor="asset-detail-primary-admin"
              >
                {asset.primary_admin?.name ?? "—"}
              </ReadOnlyField>
              <ReadOnlyField
                label="Backup administrator"
                htmlFor="asset-detail-backup-admin"
              >
                {asset.backup_admin?.name ?? "—"}
              </ReadOnlyField>
              <ReadOnlyField label="Notes" htmlFor="asset-detail-notes">
                {asset.notes || "—"}
              </ReadOnlyField>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="app-muted text-sm font-semibold">
              MFA, recovery & review
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <ReadOnlyField
                label="MFA required"
                htmlFor="asset-detail-mfa-required"
              >
                {asset.mfa_required ? "Yes" : "No"}
              </ReadOnlyField>
              <ReadOnlyField
                label="MFA status"
                htmlFor="asset-detail-mfa-status"
              >
                {humanize(asset.mfa_status)}
              </ReadOnlyField>
              <ReadOnlyField
                label="Recovery process documented"
                htmlFor="asset-detail-recovery-documented"
              >
                {asset.recovery_documented ? "Yes" : "No"}
              </ReadOnlyField>
              <ReadOnlyField
                label="Recovery owner"
                htmlFor="asset-detail-recovery-owner"
              >
                {asset.recovery_owner?.name ?? "—"}
              </ReadOnlyField>
              <ReadOnlyField
                label="Credential management location"
                htmlFor="asset-detail-credential-location"
              >
                {humanize(asset.credential_management_location)}
              </ReadOnlyField>
              <ReadOnlyField
                label="Last reviewed"
                htmlFor="asset-detail-last-reviewed"
              >
                {asset.last_reviewed || "—"}
              </ReadOnlyField>
              <ReadOnlyField
                label="Next review"
                htmlFor="asset-detail-next-review"
              >
                {asset.next_review || "—"}
              </ReadOnlyField>
            </FieldGroup>
          </CardContent>
        </Card>
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
