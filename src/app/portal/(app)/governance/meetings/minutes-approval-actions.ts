"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import type { ActionItem } from "./action-items-actions";
import type { Decision } from "./decisions-actions";

export type PreviousMeetingMinutes = {
  meetingId: string;
  meetingDate: string;
  bodyText: string | null;
  decisions: Decision[];
  actionItems: ActionItem[];
};

export type MinutesApprovalActionResult = { error: string } | { success: true };

/**
 * The most recent prior meeting's notes/decisions/action items, for the
 * Agenda tab's "Approve previous meeting minutes" review dialog. Resolves
 * "previous meeting" the same way listCarriedOverActionItemsAction does
 * (governance_meetings rows with meeting_date < beforeDate), but narrows to
 * just the single most recent one instead of every open item across all
 * prior meetings. Returns `{ data: null }` when there is no prior meeting.
 */
export async function getPreviousMeetingMinutesAction(
  meetingId: string,
  beforeDate: string,
): Promise<{ data: PreviousMeetingMinutes | null } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const { data: priorMeeting, error: priorMeetingError } = await supabase
    .from("governance_meetings")
    .select("id, meeting_date")
    .lt("meeting_date", beforeDate)
    .neq("id", meetingId)
    .order("meeting_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (priorMeetingError) {
    return {
      error: "Could not load the previous meeting's minutes. Please try again.",
    };
  }
  if (!priorMeeting) return { data: null };

  const [agendaResult, decisionsResult, actionItemsResult] = await Promise.all([
    supabase
      .from("agendas")
      .select("body_text")
      .eq("meeting_id", priorMeeting.id)
      .maybeSingle(),
    supabase
      .from("governance_meeting_decisions")
      .select("id, meeting_id, description, decision_date, topic, vote_result")
      .eq("meeting_id", priorMeeting.id)
      .order("decision_date", { ascending: true }),
    supabase
      .from("governance_meeting_action_items")
      .select(
        "id, meeting_id, description, due_date, status, owner:people!owner_person_id(id, name, preferred_name, email, phone)",
      )
      .eq("meeting_id", priorMeeting.id)
      .order("created_at", { ascending: true }),
  ]);

  if (agendaResult.error || decisionsResult.error || actionItemsResult.error) {
    return {
      error: "Could not load the previous meeting's minutes. Please try again.",
    };
  }

  return {
    data: {
      meetingId: priorMeeting.id,
      meetingDate: priorMeeting.meeting_date,
      bodyText: agendaResult.data?.body_text ?? null,
      decisions: (decisionsResult.data ?? []) as Decision[],
      actionItems: (actionItemsResult.data ?? []) as unknown as ActionItem[],
    },
  };
}

export async function approveMinutesAction(
  meetingId: string,
): Promise<MinutesApprovalActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to approve minutes.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase
    .from("governance_meetings")
    .update({
      minutes_approved_at: new Date().toISOString(),
      minutes_approved_by: userResult.user.id,
    })
    .eq("id", meetingId);

  if (error) {
    return { error: "Could not record minutes approval. Please try again." };
  }

  revalidatePath("/portal/governance/meetings");
  return { success: true };
}
