"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { siteImageSettingKey } from "@/lib/site-images";
import { pageVisibilitySettingKey } from "@/lib/page-visibility";
import {
  BRAND_COLOR_TOKENS,
  MAX_ACCENT_STOPS,
  brandSettingKey,
  normalizeHexColor,
} from "@/lib/branding";
import {
  FISCAL_YEAR_SETTING_KEY,
  isFiscalYearStartMonth,
} from "@/lib/fiscal-year";
import { EMAIL_ENABLED_SETTING_KEY } from "@/lib/notifications/kinds";

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
    .upsert({ key, value }, { onConflict: "tenant_id,key" });
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

/**
 * Sets the month the org's fiscal year starts in (issue: define fiscal year).
 * Every annual figure in the portal reads this, so a bad value would quietly
 * skew reports rather than fail loudly -- hence the range check here on top of
 * the dropdown's own constraint.
 */
export async function updateFiscalYearStartMonthAction(
  formData: FormData,
): Promise<SettingActionResult> {
  const raw = String(formData.get("startMonth") ?? "").trim();
  const startMonth = Number(raw);
  if (!isFiscalYearStartMonth(startMonth)) {
    return { error: "Pick a month between January and December." };
  }

  return updateAppSettingAction(FISCAL_YEAR_SETTING_KEY, startMonth);
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

/**
 * The organization's outbound email kill switch (#488). Off means this tenant
 * sends nothing at all -- not the daily task digest, not anything a later
 * ticket adds -- whatever any individual has turned on for themselves. Like
 * every other setting here, the write is audit-logged by the app_settings
 * trigger, which is what makes turning it off a record rather than a rumour.
 */
export async function updateEmailNotificationsEnabledAction(
  enabled: boolean,
): Promise<SettingActionResult> {
  return updateAppSettingAction(EMAIL_ENABLED_SETTING_KEY, enabled);
}

/**
 * Saves the tenant's branding (#707 Phase 4): one app_settings row per
 * colour token, the accent stops, and the logo. A blank field clears its row
 * to an empty value, which the readers treat as unset -- app_settings has no
 * delete grant, the same constraint the image slots work under.
 */
export async function updateBrandingAction(
  formData: FormData,
): Promise<SettingActionResult> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "system_settings",
    "manage",
  );
  if (permissionError) return permissionError;

  const rows: { key: string; value: unknown }[] = [];
  for (const token of BRAND_COLOR_TOKENS) {
    const raw = String(formData.get(token.key) ?? "").trim();
    if (!raw) {
      rows.push({ key: brandSettingKey(token.key), value: "" });
      continue;
    }
    const color = normalizeHexColor(raw);
    if (!color) {
      return {
        error: `${token.label} must be a six-digit hex colour like ${token.defaultValue}.`,
      };
    }
    rows.push({ key: brandSettingKey(token.key), value: color });
  }

  const stopsRaw = String(formData.get("accent_stops") ?? "").trim();
  if (!stopsRaw) {
    rows.push({ key: brandSettingKey("accent_stops"), value: "" });
  } else {
    const stops = stopsRaw
      .split(",")
      .map((stop) => normalizeHexColor(stop))
      .filter((stop): stop is string => stop !== null);
    if (stops.length === 0 || stops.length !== stopsRaw.split(",").length) {
      return {
        error:
          "Accent colours must be six-digit hex colours separated by commas.",
      };
    }
    if (stops.length > MAX_ACCENT_STOPS) {
      return { error: `Use at most ${MAX_ACCENT_STOPS} accent colours.` };
    }
    rows.push({ key: brandSettingKey("accent_stops"), value: stops });
  }

  rows.push({
    key: brandSettingKey("logo_url"),
    value: String(formData.get("logo_url") ?? "").trim(),
  });

  const { error } = await supabase
    .from("app_settings")
    .upsert(rows, { onConflict: "tenant_id,key" });
  if (error) {
    return { error: "Could not save the branding. Please try again." };
  }

  revalidatePath("/portal/administration/system-settings");
  revalidatePath("/", "layout");
  return { success: true };
}
