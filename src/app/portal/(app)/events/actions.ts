"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  parseEventAttendanceForm,
  parseEventForm,
  parseEventPlanningForm,
  parseEventReportForm,
  parseReopenReason,
} from "./event-form";
import {
  checkPermission,
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";

export type CreateEventResult = { error: string } | { success: true };

export async function createEventAction(
  formData: FormData,
): Promise<CreateEventResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to create an event.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const parsed = parseEventForm(formData);
  if ("error" in parsed) return parsed;
  const {
    name,
    description,
    eventType,
    location,
    venue,
    startsAt,
    endsAt,
    timezone,
    visibility,
    status,
    programId,
    flierUrl,
  } = parsed.data;

  const { error } = await supabase.from("events").insert({
    name,
    description,
    event_type: eventType,
    location,
    venue,
    starts_at: startsAt,
    ends_at: endsAt,
    timezone,
    visibility,
    status,
    program_id: programId,
    flier_url: flierUrl,
  });

  if (error) {
    return { error: "Could not create the event. Please try again." };
  }

  revalidatePath("/portal/home");
  revalidatePath("/portal/events");
  return { success: true };
}

export async function updateEventAttendanceAction(
  id: string,
  formData: FormData,
): Promise<CreateEventResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update attendance.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const parsed = parseEventAttendanceForm(formData);
  if ("error" in parsed) return parsed;
  const { attendanceCount, attendanceNotes } = parsed.data;

  const { error } = await supabase
    .from("events")
    .update({
      attendance_count: attendanceCount,
      attendance_notes: attendanceNotes,
    })
    .eq("id", id);

  if (error) {
    return { error: "Could not update attendance. Please try again." };
  }

  revalidatePath("/portal/home");
  revalidatePath("/portal/events");
  return { success: true };
}

export async function updateEventAction(
  id: string,
  formData: FormData,
): Promise<CreateEventResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update an event.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const parsed = parseEventForm(formData);
  if ("error" in parsed) return parsed;
  const {
    name,
    description,
    eventType,
    location,
    venue,
    startsAt,
    endsAt,
    timezone,
    visibility,
    status,
    programId,
    flierUrl,
  } = parsed.data;

  const { error } = await supabase
    .from("events")
    .update({
      name,
      description,
      event_type: eventType,
      location,
      venue,
      starts_at: startsAt,
      ends_at: endsAt,
      timezone,
      visibility,
      status,
      program_id: programId,
      flier_url: flierUrl,
    })
    .eq("id", id);

  if (error) {
    return { error: "Could not update the event. Please try again." };
  }

  revalidatePath("/portal/home");
  revalidatePath("/portal/events");
  return { success: true };
}

export async function updateEventPlanningAction(
  id: string,
  formData: FormData,
): Promise<CreateEventResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update planning details.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const parsed = parseEventPlanningForm(formData);
  if ("error" in parsed) return parsed;
  const {
    eventLeadId,
    capacity,
    registrationEnabled,
    registrationDeadline,
    autoAssignDiscountCodes,
    budgetAmount,
  } = parsed.data;

  const { error } = await supabase
    .from("events")
    .update({
      event_lead_id: eventLeadId,
      capacity,
      registration_enabled: registrationEnabled,
      registration_deadline: registrationDeadline,
      auto_assign_discount_codes: autoAssignDiscountCodes,
      budget_amount: budgetAmount,
    })
    .eq("id", id);

  if (error) {
    return { error: "Could not update planning details. Please try again." };
  }

  revalidatePath("/portal/home");
  revalidatePath("/portal/events");
  return { success: true };
}

export async function updateEventReportAction(
  id: string,
  formData: FormData,
): Promise<CreateEventResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update the event report.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const parsed = parseEventReportForm(formData);
  if ("error" in parsed) return parsed;
  const { feedbackNotes, contentNotes, lessonsLearned, reportSummary } =
    parsed.data;

  const { data: current } = await supabase
    .from("events")
    .select("report_status")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("events")
    .update({
      feedback_notes: feedbackNotes,
      content_notes: contentNotes,
      lessons_learned: lessonsLearned,
      report_summary: reportSummary,
      report_status:
        current?.report_status === "not_started"
          ? "in_progress"
          : current?.report_status,
    })
    .eq("id", id);

  if (error) {
    return { error: "Could not update the event report. Please try again." };
  }

  revalidatePath("/portal/home");
  revalidatePath("/portal/events");
  return { success: true };
}

export async function submitEventReportAction(
  id: string,
): Promise<CreateEventResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to submit the event report.",
  );
  if ("error" in userResult) return userResult;
  const { user } = userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const { error } = await supabase
    .from("events")
    .update({
      report_status: "submitted",
      report_submitted_at: new Date().toISOString(),
      report_submitted_by: user.id,
    })
    .eq("id", id);

  if (error) {
    return { error: "Could not submit the event report. Please try again." };
  }

  revalidatePath("/portal/home");
  revalidatePath("/portal/events");
  return { success: true };
}

/**
 * Whether the signed-in user can reopen a submitted event report. Checked
 * separately from reopenEventReportAction so the Report tab can gate the
 * "Reopen report" button's visibility before the user attempts the action.
 */
export async function getCanReopenEventReportAction(): Promise<{
  data: { canReopen: boolean };
}> {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  return {
    data: { canReopen: hasPermission(permissions, "administration", "manage") },
  };
}

export async function reopenEventReportAction(
  id: string,
  reason: string,
): Promise<CreateEventResult> {
  const parsed = parseReopenReason(reason);
  if ("error" in parsed) return parsed;

  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to reopen this report.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "administration",
    "manage",
    "Only an administrator can reopen a submitted report.",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase.rpc("reopen_event_report", {
    p_id: id,
    p_reason: parsed.data,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/portal/home");
  revalidatePath("/portal/events");
  return { success: true };
}

export type EventOption = { id: string; name: string };

/**
 * Event picker options for dialogs that can be opened outside their own
 * module -- notably the sidebar quick actions, where there's no page query to
 * pass options down from. Gated on events:view rather than the narrower gate
 * used by the volunteers copy of this query, so the finance role (volunteers:
 * none) can still populate an event picker.
 */
export async function listEventOptionsAction(): Promise<
  { data: EventOption[] } | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "events", "view");
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("events")
    .select("id, name")
    .order("starts_at", { ascending: false });

  if (error) {
    return { error: "Could not load events. Please try again." };
  }

  return { data: (data ?? []) as EventOption[] };
}

/**
 * Deleting is scoped to events nothing is attached to yet -- a mistyped
 * duplicate, a test row. A `before delete` trigger on events (see
 * 20260903060000) refuses anything with registrants, sponsors, staff,
 * volunteers, incidents, a giveaway, or linked finance records, since those
 * would either cascade away or be silently orphaned; those events get
 * Cancelled/Archived instead. The detail page pre-checks via
 * event_delete_blockers so the dialog can say so up front, but the trigger is
 * the enforcement.
 */
export async function deleteEventAction(
  id: string,
): Promise<CreateEventResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to delete an event.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const { error } = await supabase.from("events").delete().eq("id", id);

  if (error) {
    // The trigger's restrict_violation message already names what's blocking
    // and what to do instead, so it's worth more to the user than the generic.
    return {
      error:
        error.code === "23001"
          ? error.message
          : "Could not delete the event. Please try again.",
    };
  }

  revalidatePath("/portal/home");
  revalidatePath("/portal/events");
  return { success: true };
}
