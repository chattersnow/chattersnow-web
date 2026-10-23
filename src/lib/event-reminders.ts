/**
 * The event reminder (#1652): one email to every active registration with an
 * address, N days before the event, at 09:00 in the event's zone. Shared by
 * the planning form, the registrants surfaces, the email and the hourly job.
 *
 * Zero runtime imports, like `@/lib/outbound-messages`: the planning form is
 * a client component and the sender is `server-only`.
 */

/** `events.reminder_days_before`'s check. */
export const REMINDER_DAYS_MIN = 1;
export const REMINDER_DAYS_MAX = 14;
export const REMINDER_DAYS_DEFAULT = 2;

/** `events.reminder_intro`'s check. */
export const REMINDER_INTRO_MAX_LENGTH = 1000;

/** What a reminder opens with when staff have written nothing. */
export const DEFAULT_REMINDER_INTRO =
  "Just a reminder that you're registered for this event, and it's coming up soon. Here are the details.";

/** The stored intro: null when it is blank or the default, which reads the default. */
export function storedReminderIntro(intro: string): string | null {
  const trimmed = intro.trim();
  return trimmed && trimmed !== DEFAULT_REMINDER_INTRO ? trimmed : null;
}

export function reminderIntro(intro: string | null | undefined): string {
  return intro?.trim() || DEFAULT_REMINDER_INTRO;
}

/**
 * How many reminders the job may send in a day. The Resend account is on the
 * free tier, 100 a day, shared with every other email the platform sends, so
 * a larger event finishes over several runs. Raise `EVENT_REMINDER_DAILY_LIMIT`
 * on the Pro plan (50,000 a month, no daily cap).
 */
export const REMINDER_DAILY_LIMIT_DEFAULT = 100;

export function reminderDailyLimit(raw: string | undefined): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0
    ? parsed
    : REMINDER_DAILY_LIMIT_DEFAULT;
}

/** The job's claim, once per registration ever. */
export function scheduledReminderDedupeKey(registrationId: string): string {
  return `event_reminder:${registrationId}:scheduled`;
}

/** "Send reminder now", once per press. */
export function manualReminderDedupeKey(
  registrationId: string,
  sendId: string,
): string {
  return `event_reminder:${registrationId}:${sendId}`;
}

/** event_reminder_status()'s row, as Planning reads it. */
export type EventReminderStatus = {
  sendAt: string;
  recipients: number;
  sent: number;
};

/**
 * Planning's status line: "Scheduled for {date} · {n} recipients" before the
 * send time, "Sent {sent} of {n}, the rest next run" while the daily budget
 * holds the rest back, and "Sent to {n}" once done.
 */
export function reminderStatusText(
  status: EventReminderStatus,
  formattedSendAt: string,
  now: Date = new Date(),
): string {
  const recipients = `${status.recipients} ${status.recipients === 1 ? "recipient" : "recipients"}`;
  if (new Date(status.sendAt).getTime() > now.getTime()) {
    return `Scheduled for ${formattedSendAt} · ${recipients}`;
  }
  if (status.sent < status.recipients) {
    return `Sent ${status.sent} of ${status.recipients} · the rest go in the next hourly run`;
  }
  return `Sent ${formattedSendAt} · ${recipients}`;
}

export const REMINDER_ERRORS = {
  NOTHING_TO_SEND:
    "This registration is cancelled or has no email address, so there is no one to remind.",
  FAILED: "Could not send the reminder. Please try again.",
} as const;
