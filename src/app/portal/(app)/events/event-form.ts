import type { ParseResult } from "@/lib/forms";
import { datetimeLocalToUtcIso } from "@/lib/time";

const VISIBILITIES = ["public", "private"] as const;
const STATUSES = [
  "draft",
  "published",
  "completed",
  "cancelled",
  "archived",
] as const;

export type EventFormData = {
  name: string;
  description: string | null;
  eventType: string | null;
  location: string | null;
  venue: string | null;
  startsAt: string;
  endsAt: string | null;
  timezone: string;
  visibility: (typeof VISIBILITIES)[number];
  status: (typeof STATUSES)[number];
  programId: string | null;
  flierUrl: string | null;
};

export function parseEventForm(formData: FormData): ParseResult<EventFormData> {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const eventType = String(formData.get("eventType") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const venue = String(formData.get("venue") ?? "").trim();
  const startsAt = String(formData.get("startsAt") ?? "");
  const endsAt = String(formData.get("endsAt") ?? "");
  const timezone = String(formData.get("timezone") ?? "").trim();
  const visibility = String(formData.get("visibility") ?? "");
  const status = String(formData.get("status") ?? "");
  const programId = String(formData.get("programId") ?? "").trim();
  const flierUrl = String(formData.get("flierUrl") ?? "").trim();

  if (!name) return { error: "Event name is required." };
  if (!startsAt) return { error: "Start date and time are required." };
  if (!timezone) return { error: "Timezone is required." };
  if (!VISIBILITIES.includes(visibility as (typeof VISIBILITIES)[number])) {
    return { error: "Select a valid visibility." };
  }
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
    return { error: "Select a valid status." };
  }

  // Parsed against the submitted timezone (not the server's runtime
  // timezone) since this is a naive "YYYY-MM-DDTHH:mm" value with no offset.
  const startsAtIso = datetimeLocalToUtcIso(startsAt, timezone);
  if (!startsAtIso) return { error: "Enter a valid start date and time." };
  const endsAtIso = endsAt ? datetimeLocalToUtcIso(endsAt, timezone) : null;
  if (endsAt && !endsAtIso)
    return { error: "Enter a valid end date and time." };
  if (endsAtIso && endsAtIso < startsAtIso) {
    return { error: "End time must be after the start time." };
  }

  return {
    data: {
      name,
      description: description || null,
      eventType: eventType || null,
      location: location || null,
      venue: venue || null,
      startsAt: startsAtIso,
      endsAt: endsAtIso,
      timezone,
      visibility: visibility as (typeof VISIBILITIES)[number],
      status: status as (typeof STATUSES)[number],
      programId: programId || null,
      flierUrl: flierUrl || null,
    },
  };
}

export type EventPlanningFormData = {
  eventLeadId: string | null;
  capacity: number | null;
  registrationEnabled: boolean;
  registrationDeadline: string | null;
  autoAssignDiscountCodes: boolean;
  budgetAmount: number | null;
};

export function parseEventPlanningForm(
  formData: FormData,
): ParseResult<EventPlanningFormData> {
  const eventLeadId = String(formData.get("eventLeadId") ?? "").trim();
  const capacityRaw = String(formData.get("capacity") ?? "").trim();
  const registrationEnabled =
    formData.get("registrationEnabled") === "on" ||
    formData.get("registrationEnabled") === "true";
  const registrationDeadline = String(
    formData.get("registrationDeadline") ?? "",
  );
  const autoAssignDiscountCodes =
    formData.get("autoAssignDiscountCodes") === "on" ||
    formData.get("autoAssignDiscountCodes") === "true";
  const budgetAmountRaw = String(formData.get("budgetAmount") ?? "").trim();

  let capacity: number | null = null;
  if (capacityRaw) {
    const parsed = Number(capacityRaw);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return { error: "Capacity must be a whole number of 0 or more." };
    }
    capacity = parsed;
  }

  let budgetAmount: number | null = null;
  if (budgetAmountRaw) {
    const parsed = Number(budgetAmountRaw);
    if (Number.isNaN(parsed) || parsed < 0) {
      return { error: "Budget must be a positive number." };
    }
    budgetAmount = parsed;
  }

  return {
    data: {
      eventLeadId: eventLeadId || null,
      capacity,
      registrationEnabled,
      registrationDeadline: registrationDeadline
        ? new Date(registrationDeadline).toISOString()
        : null,
      autoAssignDiscountCodes,
      budgetAmount,
    },
  };
}

export type EventReportFormData = {
  feedbackNotes: string | null;
  contentNotes: string | null;
  lessonsLearned: string | null;
  reportSummary: string | null;
};

export function parseEventReportForm(
  formData: FormData,
): ParseResult<EventReportFormData> {
  const feedbackNotes = String(formData.get("feedbackNotes") ?? "").trim();
  const contentNotes = String(formData.get("contentNotes") ?? "").trim();
  const lessonsLearned = String(formData.get("lessonsLearned") ?? "").trim();
  const reportSummary = String(formData.get("reportSummary") ?? "").trim();

  return {
    data: {
      feedbackNotes: feedbackNotes || null,
      contentNotes: contentNotes || null,
      lessonsLearned: lessonsLearned || null,
      reportSummary: reportSummary || null,
    },
  };
}

export function parseReopenReason(reason: string): ParseResult<string> {
  const trimmed = reason.trim();
  if (!trimmed) {
    return { error: "A reason is required to reopen this report." };
  }
  return { data: trimmed };
}

export type EventAttendanceFormData = {
  attendanceCount: number | null;
  attendanceNotes: string | null;
};

export function parseEventAttendanceForm(
  formData: FormData,
): ParseResult<EventAttendanceFormData> {
  const countRaw = String(formData.get("attendanceCount") ?? "").trim();
  const notes = String(formData.get("attendanceNotes") ?? "").trim();

  let attendanceCount: number | null = null;
  if (countRaw) {
    const parsed = Number(countRaw);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return { error: "Attendance must be a whole number of 0 or more." };
    }
    attendanceCount = parsed;
  }

  return { data: { attendanceCount, attendanceNotes: notes || null } };
}
