import type { SupabaseClient } from "@supabase/supabase-js";
import type { PersonListItem } from "../../people/actions";
import type {
  AccessGrantRow,
  AssetDetail,
  AssetListRow,
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
       owner:people!assets_owner_person_id_fkey(id, name),
       primary_admin:people!assets_primary_admin_person_id_fkey(id, name),
       backup_admin:people!assets_backup_admin_person_id_fkey(id, name),
       recovery_owner:people!assets_recovery_owner_person_id_fkey(id, name)`,
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
    .select("id, name, email, phone, is_sponsor")
    .order("name", { ascending: true });
  if (error) return { error: "Could not load people. Please try again." };
  return { data: (data ?? []) as PersonListItem[] };
}
