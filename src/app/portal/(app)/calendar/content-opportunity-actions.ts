"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseContentOpportunityForm } from "./content-opportunity-form";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";

export type ContentOpportunityActionResult =
  { error: string } | { success: true; warning?: string };

export async function createContentOpportunityAction(
  calendarItemId: string,
  formData: FormData,
): Promise<ContentOpportunityActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to start a content brief.",
  );
  if ("error" in userResult) return userResult;
  const { user } = userResult;
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "manage",
  );
  if (permissionError) return permissionError;

  const parsed = parseContentOpportunityForm(formData);
  if ("error" in parsed) return parsed;
  const { data } = parsed;

  const { error } = await supabase.from("content_opportunities").insert({
    calendar_item_id: calendarItemId,
    content_status: data.contentStatus,
    skip_reason: data.skipReason,
    org_connection: data.orgConnection,
    recommended_formats: data.recommendedFormats,
    recommended_action: data.recommendedAction,
    outstanding_work: data.outstandingWork,
    internal_notes: data.internalNotes,
    owner_id: data.ownerId,
    reviewer_id: data.reviewerId,
    lead_time_days: data.leadTimeDays,
    publish_due_at: data.publishDueAt,
    review_due_at: data.reviewDueAt,
    draft_due_at: data.draftDueAt,
    status_changed_by: user.id,
    status_changed_at: new Date().toISOString(),
  });

  if (error) {
    return { error: "Could not create the content brief. Please try again." };
  }

  revalidatePath("/portal/calendar");
  return { success: true };
}

export async function updateContentOpportunityAction(
  id: string,
  formData: FormData,
): Promise<ContentOpportunityActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update a content brief.",
  );
  if ("error" in userResult) return userResult;
  const { user } = userResult;
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "manage",
  );
  if (permissionError) return permissionError;

  const parsed = parseContentOpportunityForm(formData);
  if ("error" in parsed) return parsed;
  const { data } = parsed;

  const { data: current, error: fetchError } = await supabase
    .from("content_opportunities")
    .select("content_status")
    .eq("id", id)
    .single();
  if (fetchError || !current) {
    return { error: "Could not find the content brief to update." };
  }

  const statusChanged = current.content_status !== data.contentStatus;

  const { error } = await supabase
    .from("content_opportunities")
    .update({
      content_status: data.contentStatus,
      skip_reason: data.skipReason,
      org_connection: data.orgConnection,
      recommended_formats: data.recommendedFormats,
      recommended_action: data.recommendedAction,
      outstanding_work: data.outstandingWork,
      internal_notes: data.internalNotes,
      owner_id: data.ownerId,
      reviewer_id: data.reviewerId,
      lead_time_days: data.leadTimeDays,
      publish_due_at: data.publishDueAt,
      review_due_at: data.reviewDueAt,
      draft_due_at: data.draftDueAt,
      ...(statusChanged
        ? {
            status_changed_by: user.id,
            status_changed_at: new Date().toISOString(),
          }
        : {}),
    })
    .eq("id", id);

  if (error) {
    return { error: "Could not update the content brief. Please try again." };
  }

  revalidatePath("/portal/calendar");
  return { success: true };
}
