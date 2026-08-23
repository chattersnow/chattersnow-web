"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  parseEventAttendanceForm,
  parseEventForm,
  parseEventPlanningForm,
  parseEventReportForm,
} from "./event-form";

export type CreateEventResult = { error: string } | { success: true };

export async function createEventAction(formData: FormData): Promise<CreateEventResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to create an event." };
  }

  const parsed = parseEventForm(formData);
  if ("error" in parsed) return parsed;
  const { name, description, eventType, location, venue, startsAt, endsAt, timezone, visibility, status, programId } =
    parsed.data;

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
  formData: FormData
): Promise<CreateEventResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to update attendance." };
  }

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
  formData: FormData
): Promise<CreateEventResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to update an event." };
  }

  const parsed = parseEventForm(formData);
  if ("error" in parsed) return parsed;
  const { name, description, eventType, location, venue, startsAt, endsAt, timezone, visibility, status, programId } =
    parsed.data;

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
  formData: FormData
): Promise<CreateEventResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to update planning details." };
  }

  const parsed = parseEventPlanningForm(formData);
  if ("error" in parsed) return parsed;
  const { eventLeadId, capacity, registrationEnabled, registrationDeadline, budgetAmount } = parsed.data;

  const { error } = await supabase
    .from("events")
    .update({
      event_lead_id: eventLeadId,
      capacity,
      registration_enabled: registrationEnabled,
      registration_deadline: registrationDeadline,
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

export type EventLead = { user_id: string; email: string | null };

export async function listEventLeadsAction(): Promise<{ data: EventLead[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_event_leads");

  if (error) {
    return { error: "Could not load event leads. Please try again." };
  }
  return { data: (data ?? []) as EventLead[] };
}

export async function updateEventReportAction(
  id: string,
  formData: FormData
): Promise<CreateEventResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to update the event report." };
  }

  const parsed = parseEventReportForm(formData);
  if ("error" in parsed) return parsed;
  const { feedbackNotes, contentNotes, lessonsLearned, reportSummary } = parsed.data;

  const { data: current } = await supabase.from("events").select("report_status").eq("id", id).single();

  const { error } = await supabase
    .from("events")
    .update({
      feedback_notes: feedbackNotes,
      content_notes: contentNotes,
      lessons_learned: lessonsLearned,
      report_summary: reportSummary,
      report_status: current?.report_status === "not_started" ? "in_progress" : current?.report_status,
    })
    .eq("id", id);

  if (error) {
    return { error: "Could not update the event report. Please try again." };
  }

  revalidatePath("/portal/home");
  revalidatePath("/portal/events");
  return { success: true };
}

export async function submitEventReportAction(id: string): Promise<CreateEventResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to submit the event report." };
  }

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
