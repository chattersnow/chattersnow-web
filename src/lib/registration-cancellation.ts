/**
 * Cancelling an event registration (#1418): the reasons, their labels, and
 * what the RPCs' refusals say to a person. No runtime imports, so the portal
 * dialog and `/my` can share it with the actions.
 */

export const CANCELLATION_REASONS = [
  "not_attending",
  "mistake",
  "duplicate",
  "other",
] as const;

export type CancellationReason = (typeof CANCELLATION_REASONS)[number];

export const CANCELLATION_REASON_LABELS: Record<CancellationReason, string> = {
  not_attending: "Can't attend",
  mistake: "Added by mistake",
  duplicate: "Duplicate",
  other: "Other",
};

export const CANCELLATION_NOTE_MAX = 500;

export function isCancellationReason(
  value: unknown,
): value is CancellationReason {
  return (
    typeof value === "string" &&
    (CANCELLATION_REASONS as readonly string[]).includes(value)
  );
}

export function cancellationReasonLabel(
  reason: string | null | undefined,
): string | null {
  return isCancellationReason(reason)
    ? CANCELLATION_REASON_LABELS[reason]
    : null;
}

/**
 * Whether a registrant can still cancel for themselves: only before the event
 * starts. `cancel_my_event_registration()` checks the same clock.
 */
export function canCancelOwnRegistration(
  startsAt: string,
  now: Date = new Date(),
): boolean {
  return new Date(startsAt).getTime() > now.getTime();
}

/** RPC error message -> what the person reads. */
export const CANCELLATION_ERRORS: Record<string, string> = {
  REGISTRANT_NOT_FOUND: "This registration could not be found.",
  REGISTRATION_NOT_FOUND:
    "We could not find that registration on your account.",
  NO_RECORD: "We could not find that registration on your account.",
  REGISTRATION_ALREADY_CANCELLED: "This registration is already cancelled.",
  REGISTRATION_NOT_CANCELLED: "This registration isn't cancelled.",
  REGISTRATION_CHECKED_IN:
    "This registrant is checked in. Undo the check-in before cancelling.",
  EVENT_ALREADY_STARTED:
    "This event has already started, so the registration can't be cancelled here. Please contact the organizers.",
  CANCELLATION_REASON_INVALID: "Choose a reason for the cancellation.",
  CANCELLATION_NOTE_TOO_LONG: `Keep the note to ${CANCELLATION_NOTE_MAX} characters or fewer.`,
  EVENT_AT_CAPACITY:
    "The event has filled up since this was cancelled, so it can't be restored.",
  EVENT_OPTION_FULL:
    "One of this registration's options has filled up since it was cancelled, so it can't be restored.",
  ALREADY_REGISTERED:
    "This person has registered again since, so the cancelled registration can't be restored.",
};
