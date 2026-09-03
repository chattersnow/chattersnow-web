import type { SupabaseClient } from "@supabase/supabase-js";
import type { PersonListItem } from "../../people/actions";
import type {
  AccessGrantRow,
  AssetDetail,
  AssetListRow,
  ServiceManageRow,
  ServiceRow,
} from "@/lib/portal/access-management/types";

export async function listServices(
  supabase: SupabaseClient,
): Promise<{ data: ServiceRow[] } | { error: string }> {
  const { data, error } = await supabase
    .from("services")
    .select("id, name, website, notes")
    .order("name", { ascending: true });
  if (error) return { error: "Could not load services. Please try again." };
  return { data: (data ?? []) as ServiceRow[] };
}

// Counts assets-per-service in JS rather than an embedded aggregate select
// so the management page can show "N assets" and block/warn on delete
// without relying on PostgREST count-on-embedded-resource syntax.
export async function listServicesWithAssetCounts(
  supabase: SupabaseClient,
): Promise<{ data: ServiceManageRow[] } | { error: string }> {
  const [servicesResult, assetsResult] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, website, notes")
      .order("name", { ascending: true }),
    supabase.from("assets").select("service_id"),
  ]);
  if (servicesResult.error) {
    return { error: "Could not load services. Please try again." };
  }
  const counts = new Map<string, number>();
  for (const row of (assetsResult.data ?? []) as { service_id: string }[]) {
    counts.set(row.service_id, (counts.get(row.service_id) ?? 0) + 1);
  }
  const data = ((servicesResult.data ?? []) as ServiceRow[]).map((service) => ({
    ...service,
    assetCount: counts.get(service.id) ?? 0,
  }));
  return { data };
}

// Active-grant counts per asset, fetched separately (rather than an
// embedded `access_grants(count)` select) so the filter to status=active
// stays a plain, obviously-correct query.
export async function listActiveGrantCountsByAsset(
  supabase: SupabaseClient,
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("access_grants")
    .select("asset_id")
    .eq("status", "active");
  if (error || !data) return {};
  const counts: Record<string, number> = {};
  for (const row of data as { asset_id: string }[]) {
    counts[row.asset_id] = (counts[row.asset_id] ?? 0) + 1;
  }
  return counts;
}

export async function listAssets(
  supabase: SupabaseClient,
): Promise<{ data: AssetListRow[] } | { error: string }> {
  const { data, error } = await supabase
    .from("assets")
    .select(
      "id, name, category, status, sensitivity, mfa_status, next_review, service:services(id, name)",
    )
    .order("name", { ascending: true });
  if (error) return { error: "Could not load assets. Please try again." };
  return { data: (data ?? []) as unknown as AssetListRow[] };
}

export async function getAssetDetail(
  supabase: SupabaseClient,
  assetId: string,
): Promise<{ data: AssetDetail } | { error: string }> {
  const { data, error } = await supabase
    .from("assets")
    .select(
      `id, name, service_id, category, description, url, is_org_owned,
       owner_person_id, primary_admin_person_id, backup_admin_person_id,
       status, sensitivity, mfa_required, mfa_status, recovery_documented,
       recovery_owner_person_id, credential_management_location,
       last_reviewed, next_review, notes,
       service:services(id, name),
       owner:people!assets_owner_person_id_fkey(id, name, preferred_name),
       primary_admin:people!assets_primary_admin_person_id_fkey(id, name, preferred_name),
       backup_admin:people!assets_backup_admin_person_id_fkey(id, name, preferred_name),
       recovery_owner:people!assets_recovery_owner_person_id_fkey(id, name, preferred_name)`,
    )
    .eq("id", assetId)
    .maybeSingle();
  if (error) return { error: "Could not load this asset. Please try again." };
  if (!data) return { error: "Asset not found." };
  return { data: data as unknown as AssetDetail };
}

export async function listAccessGrantsForAsset(
  supabase: SupabaseClient,
  assetId: string,
): Promise<{ data: AccessGrantRow[] } | { error: string }> {
  const { data, error } = await supabase
    .from("access_grants")
    .select(
      "id, asset_id, person_id, access_level, account_identifier, purpose, granted_at, status, expires_at, last_verified, revoked_at, notes, person:people(id, name)",
    )
    .eq("asset_id", assetId)
    .order("status", { ascending: true })
    .order("granted_at", { ascending: false });
  if (error) {
    return { error: "Could not load access grants. Please try again." };
  }
  return { data: (data ?? []) as unknown as AccessGrantRow[] };
}

// A dedicated fetch (rather than reusing people/actions.ts's
// listPeopleAction) since that action gates on people/volunteers/events/
// governance/people_intake permissions unrelated to access management --
// a role with only access_management_assets would be wrongly denied.
export async function listPeopleForAccessManagement(
  supabase: SupabaseClient,
): Promise<{ data: PersonListItem[] } | { error: string }> {
  const { data, error } = await supabase
    .from("people")
    .select("id, name, preferred_name, email, phone, is_sponsor, auth_user_id")
    .order("name", { ascending: true });
  if (error) return { error: "Could not load people. Please try again." };
  return { data: (data ?? []) as PersonListItem[] };
}
