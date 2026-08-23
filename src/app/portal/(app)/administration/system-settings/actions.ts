"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SettingActionResult = { error: string } | { success: true };

/** Generic upsert, reusable for any future app_settings key without a new migration. */
export async function updateAppSettingAction(key: string, value: unknown): Promise<SettingActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("app_settings").upsert({ key, value }, { onConflict: "key" });
  if (error) {
    return { error: "Could not save this setting. Please try again." };
  }

  revalidatePath("/portal/administration/system-settings");
  return { success: true };
}

export async function updateExpenseApprovalThresholdAction(formData: FormData): Promise<SettingActionResult> {
  const raw = String(formData.get("threshold") ?? "").trim();
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    return { error: "Threshold must be a positive number." };
  }

  return updateAppSettingAction("finance.expense_approval_threshold", value);
}
