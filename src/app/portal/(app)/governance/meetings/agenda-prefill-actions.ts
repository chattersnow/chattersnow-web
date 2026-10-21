"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import { loadCarriedForwardActions } from "../../events/carried-forward";
import {
  agendaItemsToAdd,
  eventOpenWork,
  type EventWorkInput,
  type EventWorkItem,
} from "./agenda-event-work";
import { isAgendaItems } from "./agenda-form";

/** How many items were added; 0 when the event had nothing new. */
export type AgendaPrefillResult = { error: string } | { added: number };

/**
 * What the meeting's event has open (#1624). Read under the viewer's own RLS:
 * someone who holds governance but cannot see events -- the `board` role --
 * gets no work rather than an error, and the agenda simply stays empty.
 */
async function loadEventWork(
  supabase: SupabaseClient,
  eventId: string,
): Promise<EventWorkItem[] | { error: true }> {
  const [event, checklist, retro, carried] = await Promise.all([
    supabase
      .from("events")
      .select(
        "id, name, starts_at, timezone, status, event_lead_id, capacity, budget_amount, attendance_count, report_status",
      )
      .eq("id", eventId)
      .maybeSingle(),
    supabase
      .from("event_checklist_items")
      .select("id, title")
      .eq("event_id", eventId)
      .eq("is_done", false)
      .order("created_at", { ascending: true }),
    supabase
      .from("event_retro_items")
      .select("id, kind, body, status")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true }),
    loadCarriedForwardActions<{
      id: string;
      body: string;
      event_id: string;
      created_at: string;
    }>(supabase, eventId, "id, body, event_id, created_at"),
  ]);
  if (event.error || checklist.error || retro.error || "error" in carried) {
    return { error: true };
  }
  if (!event.data) return [];

  const retroItems = retro.data ?? [];
  const input: EventWorkInput = {
    event: event.data as EventWorkInput["event"],
    retroItemCount: retroItems.length,
    openChecklistItems: checklist.data ?? [],
    openActions: retroItems.filter(
      (item) => item.kind === "action" && item.status === "open",
    ),
    carriedForward: carried.data,
  };
  return eventOpenWork(input);
}

/**
 * Adds the linked event's open work to a committee meeting's simple agenda.
 *
 * `prefill` only ever creates the agenda: once a row exists, even one somebody
 * emptied on purpose, it is never filled again, which is what makes the
 * pre-fill happen once. `refresh` appends what is not on the agenda yet and
 * leaves every existing item as it is.
 */
async function addEventWorkToAgenda(
  meetingId: string,
  mode: "prefill" | "refresh",
): Promise<AgendaPrefillResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update the agenda.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const failed = {
    error: "Could not add the event's open work. Please try again.",
  };

  const [meetingResult, agendaResult] = await Promise.all([
    supabase
      .from("governance_meetings")
      .select("meeting_type, event_id")
      .eq("id", meetingId)
      .maybeSingle(),
    supabase
      .from("agendas")
      .select("format, items")
      .eq("meeting_id", meetingId)
      .maybeSingle(),
  ]);
  if (meetingResult.error || agendaResult.error) return failed;
  const meeting = meetingResult.data;
  if (!meeting) return { error: "That meeting no longer exists." };

  // Board meetings already pull events through their `events` feed, and
  // annual and other meetings start empty: only a committee is pre-filled.
  if (meeting.meeting_type !== "committee" || !meeting.event_id) {
    return mode === "prefill"
      ? { added: 0 }
      : {
          error:
            "Only a committee meeting linked to an event can be filled from it.",
        };
  }

  const existing = agendaResult.data;
  if (existing && mode === "prefill") return { added: 0 };
  if (existing && existing.format !== "simple") {
    return {
      error:
        "This agenda was written for a different meeting type, so it can no longer be edited.",
    };
  }
  const existingItems = existing?.items ?? [];
  if (!isAgendaItems(existingItems)) return failed;

  const work = await loadEventWork(supabase, meeting.event_id);
  if ("error" in work) return failed;
  const additions = agendaItemsToAdd(work, existingItems);
  if (additions.length === 0) return { added: 0 };

  if (existing) {
    const { error } = await supabase
      .from("agendas")
      .update({ items: [...existingItems, ...additions] })
      .eq("meeting_id", meetingId);
    if (error) return failed;
  } else {
    const { error } = await supabase
      .from("agendas")
      .insert({ meeting_id: meetingId, format: "simple", items: additions });
    // Another tab created the agenda first: it is theirs, never overwritten.
    if (error?.code === "23505") return { added: 0 };
    if (error) return failed;
  }

  revalidatePath("/portal/governance/meetings");
  return { added: additions.length };
}

/** First open of a committee meeting's empty agenda (#1624). */
export async function prefillAgendaFromEventAction(
  meetingId: string,
): Promise<AgendaPrefillResult> {
  return addEventWorkToAgenda(meetingId, "prefill");
}

/** "Refresh from event": adds the event's open work not on the agenda yet. */
export async function refreshAgendaFromEventAction(
  meetingId: string,
): Promise<AgendaPrefillResult> {
  return addEventWorkToAgenda(meetingId, "refresh");
}
