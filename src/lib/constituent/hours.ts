/**
 * Logging your own volunteer hours from `/my` (#1165).
 *
 * The parsing lives here, away from the Server Action, for the reason
 * `parseMyContactForm` does: a pure function over a FormData is testable
 * without a database, and the action it feeds becomes the thin transport it
 * should be. What it is *not* is the enforcement -- every rule below is
 * checked again inside `log_my_volunteer_hours()`, which is what a request
 * made with curl meets.
 */

/** One event a volunteer may attach hours to, from `my_loggable_events()`. */
export type LoggableEvent = {
  event_id: string;
  name: string;
  starts_at: string;
  timezone: string;
};

/** One role a volunteer may name, from `my_volunteer_role_types()`. */
export type VolunteerRoleOption = { id: string; name: string };

export type LogHoursArgs = {
  p_hours: number;
  p_logged_date: string;
  p_event_id: string | null;
  p_volunteer_role_type_id: string | null;
  p_notes: string | null;
};

/**
 * The ceiling on a single entry. A staffer logging 100 hours has a reason; a
 * volunteer logging 100 hours for one day has made a typo, and the database
 * refuses it either way.
 */
export const MAX_SELF_LOGGED_HOURS = 24;

export function parseMyHoursForm(
  formData: FormData,
): { error: string } | { args: LogHoursArgs } {
  const raw = String(formData.get("hours") ?? "").trim();
  if (!raw) return { error: "How many hours did you volunteer?" };

  const hours = Number(raw);
  if (!Number.isFinite(hours) || hours <= 0) {
    return { error: "Hours must be a number greater than zero." };
  }
  if (hours > MAX_SELF_LOGGED_HOURS) {
    return {
      error: `That is more than ${MAX_SELF_LOGGED_HOURS} hours in one day. Log each day separately.`,
    };
  }
  // Quarter hours, which is what the ledger's numeric(5, 2) and every
  // timesheet anybody has ever filled in agree on.
  if (Math.round(hours * 100) % 25 !== 0) {
    return { error: "Round to the nearest quarter hour." };
  }

  const loggedDate = String(formData.get("loggedDate") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(loggedDate)) {
    return { error: "Which day did you volunteer?" };
  }

  const notes = String(formData.get("notes") ?? "").trim();

  return {
    args: {
      p_hours: Math.round(hours * 100) / 100,
      p_logged_date: loggedDate,
      p_event_id: String(formData.get("eventId") ?? "").trim() || null,
      p_volunteer_role_type_id:
        String(formData.get("roleTypeId") ?? "").trim() || null,
      p_notes: notes || null,
    },
  };
}

/**
 * What the database said, as a sentence. Everything else -- an unreachable
 * state, a stale tab -- falls through to one line that does not pretend to
 * diagnose.
 */
export const LOG_HOURS_ERRORS: Record<string, string> = {
  RATE_LIMITED: "Too many attempts — please try again in a few minutes.",
  NO_RECORD: "We could not find your record. Please sign in again.",
  INVALID_HOURS: "Hours must be a number between zero and 24.",
  DATE_IN_FUTURE: "That day has not happened yet.",
  EVENT_NOT_FOUND: "We could not find that event.",
  ROLE_NOT_FOUND: "We could not find that role.",
  ALREADY_SUBMITTED:
    "You have already logged hours for that day, and we are still looking at them.",
};
