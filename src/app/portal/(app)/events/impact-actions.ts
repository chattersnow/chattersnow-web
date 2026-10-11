"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseImpactForm } from "./impact-form";
import {
  checkPermission,
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";

/**
 * An event's impact notes row. The four figures were typed by hand before
 * #1588 and are archived: read-only, and shown only where they hold a value.
 */
export type EventImpactNote = {
  id: string;
  event_id: string;
  notes: string | null;
  first_time_riders: number | null;
  rental_subsidies_count: number | null;
  assistance_total: number | string | null;
  beginner_pairings_count: number | null;
};

export type EventImpactNotes = {
  note: EventImpactNote | null;
  /** event_impact:view. Without it the Results card shows no notes at all. */
  canView: boolean;
  /** event_impact:manage -- whether the notes field is editable. */
  canManage: boolean;
};

export type ImpactActionResult = { error: string } | { success: true };

const NOTE_COLUMNS =
  "id, event_id, notes, first_time_riders, rental_subsidies_count, assistance_total, beginner_pairings_count";

/**
 * The Results card's impact notes. A reader without event_impact:view gets
 * `canView: false` rather than an error: the card is theirs too, it just has
 * no notes section for them.
 */
export async function getEventImpactAction(
  eventId: string,
): Promise<{ data: EventImpactNotes } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  if (!hasPermission(permissions, "event_impact", "view")) {
    return { data: { note: null, canView: false, canManage: false } };
  }

  const { data, error } = await supabase
    .from("event_impact_notes")
    .select(NOTE_COLUMNS)
    .eq("event_id", eventId)
    .maybeSingle();

  if (error) {
    return { error: "Could not load impact notes. Please try again." };
  }
  return {
    data: {
      note: data as EventImpactNote | null,
      canView: true,
      canManage: hasPermission(permissions, "event_impact", "manage"),
    },
  };
}

/** Writes the notes, and only the notes: the archived figures stay as they are. */
export async function upsertEventImpactAction(
  eventId: string,
  formData: FormData,
): Promise<ImpactActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to save impact notes.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "event_impact",
    "manage",
  );
  if (permissionError) return permissionError;

  const parsed = parseImpactForm(formData);
  if ("error" in parsed) return parsed;

  // Submitting the report locks the whole Results card (#1588).
  const { data: event } = await supabase
    .from("events")
    .select("report_status")
    .eq("id", eventId)
    .maybeSingle();
  if (event?.report_status === "submitted") {
    return {
      error:
        "This event's report has been submitted. Reopen it to change the notes.",
    };
  }

  const { error } = await supabase
    .from("event_impact_notes")
    .upsert(
      { event_id: eventId, notes: parsed.data.notes },
      { onConflict: "event_id" },
    );

  if (error) {
    return { error: "Could not save impact notes. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
}
