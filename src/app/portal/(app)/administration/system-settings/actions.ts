"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { siteImageSettingKey } from "@/lib/site-images";
import { pageVisibilitySettingKey } from "@/lib/page-visibility";

export type SettingActionResult = { error: string } | { success: true };

/** Generic upsert, reusable for any future app_settings key without a new migration. */
export async function updateAppSettingAction(
  key: string,
  value: unknown,
): Promise<SettingActionResult> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "system_settings",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase
    .from("app_settings")
    .upsert({ key, value }, { onConflict: "key" });
  if (error) {
    return { error: "Could not save this setting. Please try again." };
  }

  revalidatePath("/portal/administration/system-settings");
  return { success: true };
}

export async function updateExpenseApprovalThresholdAction(
  formData: FormData,
): Promise<SettingActionResult> {
  const raw = String(formData.get("threshold") ?? "").trim();
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    return { error: "Threshold must be a positive number." };
  }

  return updateAppSettingAction("finance.expense_approval_threshold", value);
}

export async function updateReimbursementApprovalThresholdAction(
  formData: FormData,
): Promise<SettingActionResult> {
  const raw = String(formData.get("threshold") ?? "").trim();
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    return { error: "Threshold must be a positive number." };
  }

  return updateAppSettingAction(
    "finance.reimbursement_approval_threshold",
    value,
  );
}

export async function updateSiteImageAction(
  slot: string,
  formData: FormData,
): Promise<SettingActionResult> {
  const url = String(formData.get("url") ?? "").trim();
  const key = siteImageSettingKey(slot);

  // app_settings only grants insert/update (no delete), so clearing a slot
  // upserts an empty string rather than removing the row; getSiteImageUrls
  // and resolveImageUrl both already treat an empty/non-string value as unset.
  return updateAppSettingAction(key, url);
}

/**
 * Shows or hides a whole section of the public site (issue #584). The write is
 * audit-logged by the app_settings trigger, which is what makes the toggle
 * usable as a record of the board's approval.
 */
export async function updatePageVisibilityAction(
  slot: string,
  visible: boolean,
): Promise<SettingActionResult> {
  return updateAppSettingAction(pageVisibilitySettingKey(slot), visible);
}
