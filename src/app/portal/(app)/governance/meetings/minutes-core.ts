// Reading, starting, saving, finalizing and reopening a meeting's minutes,
// with no Next in it (#1082 Phase 1's core/wrapper split, applied to #1199).
// See home/donation-core.ts for why these cores exist.
//
// Only the draft save goes through an RPC, and that one is `security invoker`:
// RLS still authorizes every statement here through the `meeting_minutes`
// policies, and what the function adds is atomicity for the jsonb merge. The
// `checkPermission` calls are what turn a policy's silence -- an update that
// matches no row and reports success -- into a message somebody can act on.
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import {
  actionError,
  fromGuard,
  type ActionFailure,
} from "@/lib/portal/action-result";
import type { AgendaTemplateSection } from "./agenda-template-shared";
import { OPENING_CHECKLIST } from "./opening-checklist";
import {
  buildMinutesSnapshot,
  isMinutesSnapshot,
  type MinutesSnapshot,
  type SnapshotAgenda,
} from "./minutes-snapshot";
import type { MinutesPatch } from "./minutes-form";

export type MinutesRow = {
  id: string;
  meeting_id: string;
  agenda_snapshot: MinutesSnapshot | null;
  notes: Record<string, string>;
  body_text: string | null;
  status: "draft" | "final";
  finalized_at: string | null;
  finalized_by: string | null;
  approved_at: string | null;
  approved_by: string | null;
  approved_at_meeting_id: string | null;
  updated_at: string;
};

const MINUTES_COLUMNS =
  "id, meeting_id, agenda_snapshot, notes, body_text, status, finalized_at, finalized_by, approved_at, approved_by, approved_at_meeting_id, updated_at";

const FINAL_CONFLICT = "These minutes are final — reopen them to make changes.";

function toMinutesRow(row: Record<string, unknown>): MinutesRow {
  const notes = row.notes;
  return {
    id: row.id as string,
    meeting_id: row.meeting_id as string,
    // A snapshot written by a future version of the builder still reads; one
    // that is not a snapshot at all becomes null rather than a render crash.
    agenda_snapshot: isMinutesSnapshot(row.agenda_snapshot)
      ? row.agenda_snapshot
      : null,
    notes:
      typeof notes === "object" && notes !== null && !Array.isArray(notes)
        ? (notes as Record<string, string>)
        : {},
    body_text: (row.body_text as string | null) ?? null,
    status: row.status === "final" ? "final" : "draft",
    finalized_at: (row.finalized_at as string | null) ?? null,
    finalized_by: (row.finalized_by as string | null) ?? null,
    approved_at: (row.approved_at as string | null) ?? null,
    approved_by: (row.approved_by as string | null) ?? null,
    approved_at_meeting_id:
      (row.approved_at_meeting_id as string | null) ?? null,
    updated_at: row.updated_at as string,
  };
}

/**
 * Gated at `governance:view`, matching the select policy behind it.
 *
 * `getAgendaAction` next door gates its *read* at `manage`, which is stricter
 * than the `agendas` select policy it sits on -- a board member with view-only
 * governance access is refused an agenda the database would hand them. That is
 * a pre-existing inconsistency, noted here rather than copied; fixing it is a
 * change to the agenda tab, not to this.
 */
export async function getMinutes(
  supabase: SupabaseClient,
  meetingId: string,
): Promise<{ data: MinutesRow | null } | ActionFailure> {
  const permissionError = await checkPermission(supabase, "governance", "view");
  if (permissionError) return fromGuard("forbidden", permissionError);

  const { data, error } = await supabase
    .from("meeting_minutes")
    .select(MINUTES_COLUMNS)
    .eq("meeting_id", meetingId)
    .maybeSingle();

  if (error) {
    return actionError(
      "server_error",
      "Could not load these minutes. Please try again.",
    );
  }
  return { data: data ? toMinutesRow(data) : null };
}

/**
 * Freezes the agenda into the item list the notetaker works down, and opens a
 * draft.
 *
 * The sections come from the same fallback ladder the agenda tab computes: the
 * template version the agenda is pinned to, else the first active template, so
 * a meeting with no agenda row still gets structure rather than an empty page.
 *
 * Idempotent by refusal, and by the unique constraint alone rather than a
 * read-then-insert: `(tenant_id, meeting_id)` is what actually decides it, so a
 * second click and a genuine race take the same path to the same message, with
 * no window in between where both callers have read "no minutes yet".
 */
export async function startMinutesFromAgenda(
  supabase: SupabaseClient,
  meetingId: string,
): Promise<{ success: true; data: MinutesRow } | ActionFailure> {
  const userResult = await checkUser(
    supabase,
    "You must be signed in to start minutes.",
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
    .select("id, meeting_date")
    .eq("id", meetingId)
    .maybeSingle();

  if (meetingError) {
    return actionError(
      "server_error",
      "Could not start these minutes. Please try again.",
    );
  }
  if (!meeting) {
    return actionError("conflict", "That meeting no longer exists.");
  }

  const agendaResult = await loadAgendaForSnapshot(supabase, meetingId);
  if ("error" in agendaResult) return agendaResult;

  const snapshot = buildMinutesSnapshot({
    meetingDate: meeting.meeting_date as string,
    agenda: agendaResult.agenda,
    sections: agendaResult.sections,
    openingChecklist: OPENING_CHECKLIST,
  });

  const { data, error } = await supabase
    .from("meeting_minutes")
    .insert({
      meeting_id: meetingId,
      agenda_snapshot: snapshot,
      // The agenda's "Meeting notes" are what the minutes have been until now,
      // so they start as the closing notes rather than being left behind.
      body_text: agendaResult.bodyText,
    })
    .select(MINUTES_COLUMNS)
    .single();

  if (error) {
    if (error.code === "23505") {
      return actionError(
        "conflict",
        "Minutes have already been started for this meeting.",
      );
    }
    return actionError(
      "server_error",
      "Could not start these minutes. Please try again.",
    );
  }

  return { success: true, data: toMinutesRow(data) };
}

/**
 * One RPC. The merge is `notes || p_notes`, so an autosave sends the keys that
 * changed and nothing else; a read-modify-write here would lose a write every
 * time two saves overlapped, which debounced typing makes routine.
 *
 * No row back means there is no draft to write to -- the minutes are final, or
 * were never started.
 */
export async function saveMinutesDraft(
  supabase: SupabaseClient,
  meetingId: string,
  patch: MinutesPatch,
): Promise<{ success: true; savedAt: string } | ActionFailure> {
  const userResult = await checkUser(
    supabase,
    "You must be signed in to save minutes.",
  );
  if ("error" in userResult) return fromGuard("unauthenticated", userResult);
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return fromGuard("forbidden", permissionError);

  const { data, error } = await supabase.rpc("save_meeting_minutes_draft", {
    p_meeting_id: meetingId,
    p_notes: patch.notes,
    p_body_text: patch.body_text ?? null,
    p_body_text_set: "body_text" in patch,
  });

  if (error) {
    return actionError(
      "server_error",
      "Could not save these minutes. Please try again.",
    );
  }
  if (!data) return actionError("conflict", FINAL_CONFLICT);

  return { success: true, savedAt: data as string };
}

/** The notetaker putting the pen down. Not the board's approval. */
export async function finalizeMinutes(
  supabase: SupabaseClient,
  meetingId: string,
): Promise<{ success: true } | ActionFailure> {
  const userResult = await checkUser(
    supabase,
    "You must be signed in to finalize minutes.",
  );
  if ("error" in userResult) return fromGuard("unauthenticated", userResult);
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return fromGuard("forbidden", permissionError);

  const { data, error } = await supabase
    .from("meeting_minutes")
    .update({
      status: "final",
      finalized_at: new Date().toISOString(),
      finalized_by: userResult.user.id,
      updated_by: userResult.user.id,
    })
    .eq("meeting_id", meetingId)
    .eq("status", "draft")
    .select("id");

  if (error) {
    return actionError(
      "server_error",
      "Could not finalize these minutes. Please try again.",
    );
  }
  if (!data || data.length === 0) {
    return actionError(
      "conflict",
      "There are no draft minutes to finalize for this meeting.",
    );
  }

  return { success: true };
}

/** Mirrors `finalizeMinutes`: the only write the trigger lets a final row take. */
export async function reopenMinutes(
  supabase: SupabaseClient,
  meetingId: string,
): Promise<{ success: true } | ActionFailure> {
  const userResult = await checkUser(
    supabase,
    "You must be signed in to reopen minutes.",
  );
  if ("error" in userResult) return fromGuard("unauthenticated", userResult);
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return fromGuard("forbidden", permissionError);

  const { data, error } = await supabase
    .from("meeting_minutes")
    .update({
      status: "draft",
      finalized_at: null,
      finalized_by: null,
      updated_by: userResult.user.id,
    })
    .eq("meeting_id", meetingId)
    .eq("status", "final")
    .select("id");

  if (error) {
    return actionError(
      "server_error",
      "Could not reopen these minutes. Please try again.",
    );
  }
  if (!data || data.length === 0) {
    return actionError(
      "conflict",
      "There are no finalized minutes to reopen for this meeting.",
    );
  }

  return { success: true };
}

/**
 * The agenda row plus the sections to render it against, resolved through the
 * agenda tab's ladder. Read here rather than through `getAgendaAction`, which
 * is a `"use server"` module and would drag `next/cache` into this core.
 */
async function loadAgendaForSnapshot(
  supabase: SupabaseClient,
  meetingId: string,
): Promise<
  | {
      agenda: SnapshotAgenda | null;
      bodyText: string | null;
      sections: AgendaTemplateSection[];
    }
  | ActionFailure
> {
  const { data: agenda, error } = await supabase
    .from("agendas")
    .select(
      "external_link, body_text, template_id, template_version_id, ongoing_items, new_business, parking_lot, upcoming_dates, next_meeting_date, next_meeting_topics, agenda_template_versions!agendas_template_version_id_fkey(sections)",
    )
    .eq("meeting_id", meetingId)
    .maybeSingle();

  if (error) {
    return actionError(
      "server_error",
      "Could not read the agenda for these minutes. Please try again.",
    );
  }

  const row = agenda as unknown as
    | (SnapshotAgenda & {
        body_text: string | null;
        agenda_template_versions: {
          sections: AgendaTemplateSection[];
        } | null;
      })
    | null;

  const pinnedSections = row?.agenda_template_versions?.sections ?? [];
  if (pinnedSections.length > 0) {
    return {
      agenda: row,
      bodyText: row?.body_text ?? null,
      sections: pinnedSections,
    };
  }

  // No agenda, or an agenda saved before any template was pinned: fall back to
  // the first active template, the same one the agenda form would have offered.
  const { data: templates, error: templatesError } = await supabase
    .from("agenda_templates")
    .select(
      "agenda_template_versions!agenda_templates_current_version_id_fkey(sections)",
    )
    .eq("is_active", true)
    .not("current_version_id", "is", null)
    .order("name", { ascending: true })
    .limit(1);

  if (templatesError) {
    return actionError(
      "server_error",
      "Could not read the agenda template for these minutes. Please try again.",
    );
  }

  const fallback = (templates ?? [])[0] as unknown as
    | { agenda_template_versions: { sections: AgendaTemplateSection[] } | null }
    | undefined;

  return {
    agenda: row,
    bodyText: row?.body_text ?? null,
    sections: fallback?.agenda_template_versions?.sections ?? [],
  };
}
