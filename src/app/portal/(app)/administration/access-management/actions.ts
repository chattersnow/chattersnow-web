"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkAnyPermission, checkPermission } from "@/lib/auth/permissions";
import { friendlyError } from "@/lib/db-errors";
import { computeNextReviewDate } from "@/lib/portal/access-management/review-cadence";
import { parseAccessGrantForm } from "./access-grant-form";
import { parseAssetForm } from "./asset-form";

function revalidateAccessManagementPaths(assetId?: string) {
  revalidatePath("/portal/administration/access-management");
  if (assetId) {
    revalidatePath(
      `/portal/administration/access-management/assets/${assetId}`,
    );
  }
}

export type ServiceActionResult =
  { error: string } | { success: true; service: { id: string; name: string } };

export async function createServiceAction(
  name: string,
  website: string,
  notes: string,
): Promise<ServiceActionResult> {
  const trimmedName = name.trim();
  if (!trimmedName) return { error: "Service name is required." };
  const trimmedWebsite = website.trim();
  if (trimmedWebsite && !/^https?:\/\//i.test(trimmedWebsite)) {
    return { error: "Website must start with http:// or https://." };
  }

  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "access_management_assets",
    "manage",
  );
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("services")
    .insert({
      name: trimmedName,
      website: trimmedWebsite || null,
      notes: notes.trim() || null,
    })
    .select("id, name")
    .single();
  if (error || !data) {
    return {
      error: friendlyError(
        error ?? {},
        "A service with that name already exists.",
        "Could not create service. Please try again.",
      ),
    };
  }

  revalidateAccessManagementPaths();
  return { success: true, service: data };
}

export type AssetActionResult =
  { error: string } | { success: true; assetId: string };

export async function createAssetAction(
  formData: FormData,
): Promise<AssetActionResult> {
  const parsed = parseAssetForm(formData);
  if ("error" in parsed) return parsed;

  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "access_management_assets",
    "manage",
  );
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("assets")
    .insert(parsed.data)
    .select("id")
    .single();
  if (error || !data) {
    return { error: "Could not create asset. Please try again." };
  }

  revalidateAccessManagementPaths();
  return { success: true, assetId: data.id as string };
}

export async function updateAssetAction(
  assetId: string,
  formData: FormData,
): Promise<{ error: string } | { success: true }> {
  const parsed = parseAssetForm(formData);
  if ("error" in parsed) return parsed;

  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "access_management_assets",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase
    .from("assets")
    .update(parsed.data)
    .eq("id", assetId);
  if (error) {
    return { error: "Could not update asset. Please try again." };
  }

  revalidateAccessManagementPaths(assetId);
  return { success: true };
}

// The manual "review" action (acceptance criteria: updates last_reviewed/
// next_review per the sensitivity cadence table, writes an audit_log
// entry -- the latter is automatic via the assets audit trigger, so this
// just needs to perform the UPDATE). Available to access_management_reviews
// as well as access_management_assets, matching the assets UPDATE RLS
// policy -- a role that can only review shouldn't need full asset-manage
// rights.
export async function reviewAssetAction(
  assetId: string,
  sensitivity: string,
): Promise<{ error: string } | { success: true; nextReview: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkAnyPermission(supabase, [
    { resource: "access_management_assets", level: "manage" },
    { resource: "access_management_reviews", level: "manage" },
  ]);
  if (permissionError) return permissionError;

  const today = new Date();
  const nextReview = computeNextReviewDate(
    sensitivity as Parameters<typeof computeNextReviewDate>[0],
    today,
  );

  const { error } = await supabase
    .from("assets")
    .update({
      last_reviewed: today.toISOString().slice(0, 10),
      next_review: nextReview,
    })
    .eq("id", assetId);
  if (error) {
    return { error: "Could not record this review. Please try again." };
  }

  revalidateAccessManagementPaths(assetId);
  return { success: true, nextReview };
}

export async function createAccessGrantAction(
  assetId: string,
  formData: FormData,
): Promise<{ error: string } | { success: true }> {
  const parsed = parseAccessGrantForm(formData);
  if ("error" in parsed) return parsed;

  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "access_management_assets",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase
    .from("access_grants")
    .insert({ ...parsed.data, asset_id: assetId });
  if (error) {
    return {
      error: friendlyError(
        error,
        "This person already has an active grant on this asset.",
        "Could not add access grant. Please try again.",
      ),
    };
  }

  revalidateAccessManagementPaths(assetId);
  return { success: true };
}

export async function updateAccessGrantAction(
  grantId: string,
  assetId: string,
  formData: FormData,
): Promise<{ error: string } | { success: true }> {
  const parsed = parseAccessGrantForm(formData);
  if ("error" in parsed) return parsed;

  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "access_management_assets",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase
    .from("access_grants")
    .update(parsed.data)
    .eq("id", grantId);
  if (error) {
    return {
      error: friendlyError(
        error,
        "This person already has an active grant on this asset.",
        "Could not update access grant. Please try again.",
      ),
    };
  }

  revalidateAccessManagementPaths(assetId);
  return { success: true };
}

// Sets last_verified without touching anything else -- the lightweight
// "I checked this grant is still correct" action, available to
// access_management_reviews as well as access_management_assets (same
// reasoning as reviewAssetAction).
export async function verifyAccessGrantAction(
  grantId: string,
  assetId: string,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkAnyPermission(supabase, [
    { resource: "access_management_assets", level: "manage" },
    { resource: "access_management_reviews", level: "manage" },
  ]);
  if (permissionError) return permissionError;

  const { error } = await supabase
    .from("access_grants")
    .update({ last_verified: new Date().toISOString().slice(0, 10) })
    .eq("id", grantId);
  if (error) {
    return { error: "Could not record verification. Please try again." };
  }

  revalidateAccessManagementPaths(assetId);
  return { success: true };
}

export async function revokeAccessGrantAction(
  grantId: string,
  assetId: string,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "access_management_assets",
    "manage",
  );
  if (permissionError) return permissionError;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("access_grants")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString().slice(0, 10),
      revoked_by: user?.id ?? null,
    })
    .eq("id", grantId);
  if (error) {
    return { error: "Could not revoke access grant. Please try again." };
  }

  revalidateAccessManagementPaths(assetId);
  return { success: true };
}
