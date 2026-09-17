"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import {
  actionError,
  fromGuard,
  type ActionFailure,
} from "@/lib/portal/action-result";
import type { ActionItem } from "./action-items-actions";
import type { Decision } from "./decisions-actions";
import { isMinutesSnapshot, type MinutesSnapshot } from "./minutes-snapshot";

export type PreviousMeetingMinutes = {
  meetingId: string;
  meetingDate: string;
  /**
   * Which record the caller is looking at.
   *
   * `minutes` is a real `meeting_minutes` row (#1199). `agenda_notes` is the
   * prior meeting's `agendas.body_text`, which is what "the minutes" were
   * between #408 and #1200 -- every meeting older than the minutes record has
   * only that, so the dialog must still be able to show it and must say which
   * of the two it is showing.
   */
  source: "minutes" | "agenda_notes";
  bodyText: string | null;
  /** Present only for `source: "minutes"`: the walked snapshot and its notes. */
  snapshot: MinutesSnapshot | null;
  notes: Record<string, string>;
  status: "draft" | "final" | null;
  finalizedAt: string | null;
  decisions: Decision[];
  actionItems: ActionItem[];
};

export type MinutesApprovalActionResult = ActionFailure | { success: true };

function notesRecord(value: unknown): Record<string, string> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, string>)
    : {};
}

/**
 * The most recent prior meeting's record, for the Agenda tab's "Approve
 * previous meeting minutes" review dialog. Resolves "previous meeting" the
 * same way `listCarriedOverActionItemsAction` does (`governance_meetings` rows
 * with `meeting_date < beforeDate`), but narrows to just the single most
 * recent one instead of every open item across all prior meetings. Returns
 * `{ data: null }` when there is no prior meeting.
 *
 * Prefers that meeting's `meeting_minutes` row and falls back to its agenda
 * notes when it has none. Until #1201 it only ever read the agenda, which
 * meant the board approved a blob of pre-meeting context rather than the
 * minutes somebody actually took.
 *
 * Still `{ error: string }` rather than the #1082 envelope: the only caller is
 * a `useTabData` in `agenda-tab.tsx`, which renders `loadError` as text. The
 * write below has a code worth branching on, which is why that one moved.
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

  const [minutesResult, agendaResult, decisionsResult, actionItemsResult] =
    await Promise.all([
      supabase
        .from("meeting_minutes")
        .select("body_text, notes, agenda_snapshot, status, finalized_at")
        .eq("meeting_id", priorMeeting.id)
        .maybeSingle(),
      supabase
        .from("agendas")
        .select("body_text")
        .eq("meeting_id", priorMeeting.id)
        .maybeSingle(),
      supabase
        .from("governance_meeting_decisions")
        .select(
          "id, meeting_id, description, decision_date, topic, vote_result",
        )
        .eq("meeting_id", priorMeeting.id)
        .order("decision_date", { ascending: true }),
      supabase
        .from("governance_meeting_action_items")
        .select(
          "id, meeting_id, description, due_date, status, minutes_item_key, owner:people!governance_meeting_action_items_owner_person_id_fkey(id, name, preferred_name, email, phone)",
        )
        .eq("meeting_id", priorMeeting.id)
        .order("created_at", { ascending: true }),
    ]);

  if (
    minutesResult.error ||
    agendaResult.error ||
    decisionsResult.error ||
    actionItemsResult.error
  ) {
    return {
      error: "Could not load the previous meeting's minutes. Please try again.",
    };
  }

  const minutes = minutesResult.data;
  const shared = {
    meetingId: priorMeeting.id,
    meetingDate: priorMeeting.meeting_date,
    decisions: (decisionsResult.data ?? []) as Decision[],
    actionItems: (actionItemsResult.data ?? []) as unknown as ActionItem[],
  };

  if (!minutes) {
    return {
      data: {
        ...shared,
        source: "agenda_notes",
        bodyText: agendaResult.data?.body_text ?? null,
        snapshot: null,
        notes: {},
        status: null,
        finalizedAt: null,
      },
    };
  }

  return {
    data: {
      ...shared,
      source: "minutes",
      bodyText: minutes.body_text ?? null,
      // Guarded the same way `toMinutesRow` guards it: a snapshot written by a
      // future version of the builder still reads, and something that is not a
      // snapshot at all becomes null rather than a render crash.
      snapshot: isMinutesSnapshot(minutes.agenda_snapshot)
        ? minutes.agenda_snapshot
        : null,
      notes: notesRecord(minutes.notes),
      status: minutes.status === "final" ? "final" : "draft",
      finalizedAt: minutes.finalized_at ?? null,
    },
  };
}

/**
 * The board approving the previous meeting's minutes, at this meeting.
 *
 * Two writes, because the fact has two places it has to be readable from: the
 * badge on this meeting's opening checklist reads
 * `governance_meetings.minutes_approved_at`, and a set of minutes has to be
 * able to answer for itself without knowing which meeting approved it, which
 * is what the `meeting_minutes.approved_*` columns are for. Un-duplicating
 * them is the follow-up #1199's migration already names.
 *
 * Refuses while those minutes are still a draft. Approving minutes the
 * notetaker has not put down the pen on would record the board's assent to
 * text that is still moving -- and the `meeting_minutes` trigger that protects
 * finalized content is exactly what makes a final row safe to approve.
 */
export async function approveMinutesAction(
  meetingId: string,
): Promise<MinutesApprovalActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to approve minutes.",
  );
  if ("error" in userResult) return fromGuard("unauthenticated", userResult);
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return fromGuard("forbidden", permissionError);

  const { data: meeting, error: meetingError } = await supabase
    .from("governance_meetings")
    .select("meeting_date")
    .eq("id", meetingId)
    .maybeSingle();

  if (meetingError) {
    return actionError(
      "server_error",
      "Could not record minutes approval. Please try again.",
    );
  }
  if (!meeting) {
    return actionError("conflict", "This meeting no longer exists.");
  }

  // The meeting being approved is the prior one, resolved the same way the
  // review dialog resolved it -- not `meetingId`, which is the meeting doing
  // the approving.
  const { data: priorMeeting, error: priorMeetingError } = await supabase
    .from("governance_meetings")
    .select("id")
    .lt("meeting_date", meeting.meeting_date)
    .neq("id", meetingId)
    .order("meeting_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (priorMeetingError) {
    return actionError(
      "server_error",
      "Could not record minutes approval. Please try again.",
    );
  }

  if (priorMeeting) {
    const { data: priorMinutes, error: priorMinutesError } = await supabase
      .from("meeting_minutes")
      .select("id, status")
      .eq("meeting_id", priorMeeting.id)
      .maybeSingle();

    if (priorMinutesError) {
      return actionError(
        "server_error",
        "Could not record minutes approval. Please try again.",
      );
    }

    if (priorMinutes && priorMinutes.status !== "final") {
      return actionError("conflict", "Finalize these minutes first.");
    }

    if (priorMinutes) {
      const { error: stampError } = await supabase
        .from("meeting_minutes")
        .update({
          approved_at: new Date().toISOString(),
          approved_by: userResult.user.id,
          approved_at_meeting_id: meetingId,
        })
        .eq("id", priorMinutes.id);

      if (stampError) {
        return actionError(
          "server_error",
          "Could not record minutes approval. Please try again.",
        );
      }
    }
  }

  const { error } = await supabase
    .from("governance_meetings")
    .update({
      minutes_approved_at: new Date().toISOString(),
      minutes_approved_by: userResult.user.id,
    })
    .eq("id", meetingId);

  if (error) {
    return actionError(
      "server_error",
      "Could not record minutes approval. Please try again.",
    );
  }

  revalidatePath("/portal/governance/meetings");
  return { success: true };
}
