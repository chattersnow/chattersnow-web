"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseContentPermissionForm } from "./content-permission-shared";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";

export type ContentPermissionActionResult =
  { error: string } | { success: true };

/**
 * Insert-or-update by content_opportunity_id: content_permissions is
 * one-to-one with a content opportunity, and this codebase avoids
 * .upsert() elsewhere in favor of an explicit select-then-branch (see
 * publishTemplateVersionAction/content-opportunity-actions.ts).
 */
export async function upsertContentPermissionAction(
  contentOpportunityId: string,
  formData: FormData,
): Promise<ContentPermissionActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to record consent.",
  );
  if ("error" in userResult) return userResult;
  const { user } = userResult;
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "manage",
  );
  if (permissionError) return permissionError;

  const parsed = parseContentPermissionForm(formData);
  if ("error" in parsed) return parsed;
  const { data } = parsed;

  const { data: existing } = await supabase
    .from("content_permissions")
    .select("id")
    .eq("content_opportunity_id", contentOpportunityId)
    .maybeSingle();

  const payload = {
    permitted_use: data.permittedUse,
    usage_limits: data.usageLimits,
    consent_on_file_at: data.consentOnFileAt,
    recorded_by: user.id,
  };

  const { error } = existing
    ? await supabase
        .from("content_permissions")
        .update(payload)
        .eq("id", existing.id)
    : await supabase.from("content_permissions").insert({
        content_opportunity_id: contentOpportunityId,
        ...payload,
      });

  if (error) {
    return { error: "Could not save consent. Please try again." };
  }

  revalidatePath("/portal/calendar");
  return { success: true };
}
