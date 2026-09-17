"use server";

// Web transport for the minutes core (#1199). Every decision lives in
// minutes-core.ts, which has no Next imports.
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fromParseError, type ActionFailure } from "@/lib/portal/action-result";
import { parseMinutesPatch, type MinutesPatchInput } from "./minutes-form";
import {
  finalizeMinutes,
  getMinutes,
  reopenMinutes,
  saveMinutesDraft,
  startMinutesFromAgenda,
  type MinutesRow,
} from "./minutes-core";

export type { MinutesRow } from "./minutes-core";

export async function getMinutesAction(
  meetingId: string,
): Promise<{ data: MinutesRow | null } | ActionFailure> {
  const supabase = await createSupabaseServerClient();
  return getMinutes(supabase, meetingId);
}

export async function startMinutesFromAgendaAction(
  meetingId: string,
): Promise<{ success: true; data: MinutesRow } | ActionFailure> {
  const supabase = await createSupabaseServerClient();
  const result = await startMinutesFromAgenda(supabase, meetingId);
  if ("error" in result) return result;

  revalidatePath("/portal/governance/meetings");
  return result;
}

/**
 * The one write here that deliberately does NOT revalidate.
 *
 * `upsertAgendaAction` revalidates on every save, which is right for a form
 * with a Save button. This is a debounced autosave: revalidating would re-run
 * the meetings route's server component on every pause in typing, for a tab
 * that already holds the saved state in its own props.
 */
export async function saveMinutesDraftAction(
  meetingId: string,
  input: MinutesPatchInput,
): Promise<{ success: true; savedAt: string } | ActionFailure> {
  const parsed = parseMinutesPatch(input);
  if ("error" in parsed) return fromParseError(parsed);

  const supabase = await createSupabaseServerClient();
  return saveMinutesDraft(supabase, meetingId, parsed.data);
}

export async function finalizeMinutesAction(
  meetingId: string,
): Promise<{ success: true } | ActionFailure> {
  const supabase = await createSupabaseServerClient();
  const result = await finalizeMinutes(supabase, meetingId);
  if ("error" in result) return result;

  revalidatePath("/portal/governance/meetings");
  return result;
}

export async function reopenMinutesAction(
  meetingId: string,
): Promise<{ success: true } | ActionFailure> {
  const supabase = await createSupabaseServerClient();
  const result = await reopenMinutes(supabase, meetingId);
  if ("error" in result) return result;

  revalidatePath("/portal/governance/meetings");
  return result;
}
