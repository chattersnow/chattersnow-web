import type { ParseResult } from "@/lib/forms";

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
  location: string | null;
  startsAt: string;
  endsAt: string | null;
  timezone: string;
  visibility: (typeof VISIBILITIES)[number];
  status: (typeof STATUSES)[number];
  programIds: string[];
  flierUrl: string | null;
};

/** A UTC instant as the client sent it, or null if it is not one. */
function toInstant(value: string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function parseEventForm(formData: FormData): ParseResult<EventFormData> {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const startsAt = String(formData.get("startsAt") ?? "");
  const endsAt = String(formData.get("endsAt") ?? "");
  const timezone = String(formData.get("timezone") ?? "").trim();
  const visibility = String(formData.get("visibility") ?? "");
  const status = String(formData.get("status") ?? "");
  // An event may count toward any number of programs, including none, so the
  // empty list is valid and there is nothing to validate here.
  const programIds = formData.getAll("programIds").map(String);
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

  // Already instants: since #1063 the browser converts before submitting, so
  // what arrives here is a UTC ISO string rather than a naive wall-clock one.
  // Doing it in the client is the whole point -- this parser runs on the
  // server, where the only zone available is the server's own (UTC on
  // Vercel), which is never the zone the typist meant. `events.timezone` is
  // still collected and still governs how the *public* site renders the
  // event; it no longer says how a typed time is read.
  const startsAtIso = toInstant(startsAt);
  if (!startsAtIso) return { error: "Enter a valid start date and time." };
  const endsAtIso = endsAt ? toInstant(endsAt) : null;
  if (endsAt && !endsAtIso)
    return { error: "Enter a valid end date and time." };
  if (endsAtIso && endsAtIso < startsAtIso) {
    return { error: "End time must be after the start time." };
  }

  return {
    data: {
      name,
      description: description || null,
      location: location || null,
      startsAt: startsAtIso,
      endsAt: endsAtIso,
      timezone,
      visibility: visibility as (typeof VISIBILITIES)[number],
      status: status as (typeof STATUSES)[number],
      programIds,
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
  /**
   * #1417. Null when the form did not send the field, so a save from a form
   * that does not show the switch leaves the column as it was.
   */
  adultsOnly: boolean | null;
  budgetAmount: number | null;
};

export function parseEventPlanningForm(
  formData: FormData,
  event: { startsAt: string; endsAt: string | null },
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
  const adultsOnlyRaw = formData.get("adultsOnly");
  const adultsOnly =
    adultsOnlyRaw === null
      ? null
      : adultsOnlyRaw === "on" || adultsOnlyRaw === "true";
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

  // A deadline only means something while registration is open, so drop any
  // value submitted with registration turned off rather than storing a stale
  // cutoff that `register_for_event` would still read.
  let registrationDeadlineIso: string | null = null;
  if (registrationEnabled && registrationDeadline) {
    const parsedDeadline = Date.parse(registrationDeadline);
    if (Number.isNaN(parsedDeadline)) {
      return { error: "Enter a valid registration deadline." };
    }
    registrationDeadlineIso = new Date(parsedDeadline).toISOString();

    // Registration can't stay open past the event itself; events without an
    // end time are bounded by their start instead. Compared as timestamps
    // because the event's dates come straight from Postgres
    // ("...+00:00") and won't string-compare against `toISOString()`.
    const cutoff = Date.parse(event.endsAt ?? event.startsAt);
    if (!Number.isNaN(cutoff) && parsedDeadline > cutoff) {
      return {
        error: event.endsAt
          ? "Registration deadline must be on or before the event's end date."
          : "Registration deadline must be on or before the event's start date.",
      };
    }
  }

  return {
    data: {
      eventLeadId: eventLeadId || null,
      capacity,
      registrationEnabled,
      registrationDeadline: registrationDeadlineIso,
      autoAssignDiscountCodes,
      adultsOnly,
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

/**
 * An event's registration question as the Planning tab submits it (#1407):
 * the whole list, in display order. `save_event_registration_options()`
 * checks all of this again; this is so the tab can say which rule it broke.
 */
export type EventRegistrationOptionsFormData = {
  prompt: string | null;
  options: { id: string | null; label: string; cap: number | null }[];
};

export const REGISTRATION_OPTIONS_SAVE_ERRORS: Record<string, string> = {
  EVENT_OPTIONS_INVALID:
    "Each option needs a name, and a cap must be a whole number of 0 or more.",
  EVENT_OPTIONS_TOO_MANY: "An event can offer at most 10 options.",
  EVENT_OPTIONS_PROMPT_REQUIRED: "Write the question the options answer.",
  EVENT_OPTIONS_DUPLICATE: "Two options have the same name.",
};

/**
 * Null when the field was not sent -- the tab sends it only when the
 * question changed.
 */
export function parseEventRegistrationOptionsField(
  raw: FormDataEntryValue | null,
): ParseResult<EventRegistrationOptionsFormData> | null {
  if (raw === null) return null;
  const invalid = {
    error: REGISTRATION_OPTIONS_SAVE_ERRORS.EVENT_OPTIONS_INVALID,
  };

  let value: unknown;
  try {
    value = JSON.parse(String(raw));
  } catch {
    return invalid;
  }
  const draft = value as {
    prompt?: unknown;
    options?: { id?: unknown; label?: unknown; cap?: unknown }[];
  };
  if (!draft || !Array.isArray(draft.options)) return invalid;

  const options: EventRegistrationOptionsFormData["options"] = [];
  for (const option of draft.options) {
    const label = String(option?.label ?? "").trim();
    if (!label || label.length > 120) return invalid;
    const capRaw = String(option?.cap ?? "").trim();
    const cap = capRaw === "" ? null : Number(capRaw);
    if (cap !== null && (!Number.isInteger(cap) || cap < 0)) return invalid;
    const id = typeof option?.id === "string" && option.id ? option.id : null;
    options.push({ id, label, cap });
  }

  if (options.length > 10) {
    return { error: REGISTRATION_OPTIONS_SAVE_ERRORS.EVENT_OPTIONS_TOO_MANY };
  }
  const prompt = String(draft.prompt ?? "").trim();
  if (options.length > 0 && !prompt) {
    return {
      error: REGISTRATION_OPTIONS_SAVE_ERRORS.EVENT_OPTIONS_PROMPT_REQUIRED,
    };
  }
  if (prompt.length > 300) return invalid;
  const labels = new Set(options.map((option) => option.label.toLowerCase()));
  if (labels.size !== options.length) {
    return { error: REGISTRATION_OPTIONS_SAVE_ERRORS.EVENT_OPTIONS_DUPLICATE };
  }

  return { data: { prompt: options.length > 0 ? prompt : null, options } };
}
