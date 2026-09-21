/**
 * The vocabulary of a message a staff member sends to a person from the portal
 * (#1203): the caps the composer counts against, the kind that is deliberately
 * not a notification kind, and how a send's outcome reads.
 *
 * Zero runtime imports on purpose, like `@/lib/gear-requests` and
 * `@/lib/notifications/kinds`: the composer is a client component and the
 * sender is `server-only`, and both need these constants. Anything that
 * touches Supabase lives in `@/lib/notifications/outbound-messages` instead.
 */

/**
 * `staff_message` is absent from NOTIFICATION_KINDS on purpose, and that
 * absence is load-bearing rather than an oversight -- `kinds.test.ts` asserts
 * it. hasOptedOut() (src/lib/notifications/deliver.ts) consults
 * `person_notification_preferences` only for a kind with a registered default,
 * so an unregistered kind is never suppressed. A reply about a request
 * somebody made themselves is correspondence, not a subscription, and staff
 * have to be able to answer a person who switched their receipts off. The
 * org-wide kill switch still governs it.
 */
export const STAFF_MESSAGE_KIND = "staff_message";

/**
 * A notice sent to everybody registered for an event (#1317), and deliberately
 * a different kind from `staff_message` rather than a batch of them.
 *
 * Absent from NOTIFICATION_KINDS for exactly the reason `staff_message` is --
 * `kinds.test.ts` asserts both -- but kept apart from it because the two are
 * not the same class of mail. Correspondence with somebody who asked the
 * organization for something is one thing; a notice posted to a list of people
 * who registered is another, and keeping them distinct is what lets a consent
 * or unsubscribe story attach to the second later without touching the first.
 *
 * The org-wide kill switch governs it, as it governs everything.
 */
export const EVENT_ANNOUNCEMENT_KIND = "event_announcement";

/** Matching the check constraints on `outbound_messages`. */
export const MAX_MESSAGE_SUBJECT_LENGTH = 200;
export const MAX_MESSAGE_BODY_LENGTH = 5000;

/**
 * What `outbound_messages.record_type` holds for each record a message can be
 * about. The column is free text and the read policy keys on `module`, not on
 * these, so a new one costs no migration (#1203) -- but it is the join between
 * a record and its history, so every writer and every reader of one queue has
 * to spell it the same way.
 */
export const GEAR_REQUEST_RECORD_TYPE = "gear_request";
export const VOLUNTEER_APPLICATION_RECORD_TYPE = "volunteer_application";
export const CONTACT_MESSAGE_RECORD_TYPE = "contact_message";
export const ARTWORK_SUBMISSION_RECORD_TYPE = "artwork_submission";
export const EVENT_REGISTRATION_RECORD_TYPE = "event_registration";

/**
 * One row of a record's message history, and the names behind `sent_by`.
 *
 * Here rather than beside the list that renders them because both a Server
 * Component loading them and a client component displaying them need the
 * shape, and this module is the one with no runtime imports either way.
 */
export type RecordMessageRow = {
  id: string;
  subject: string;
  kind: string;
  status: string;
  created_at: string;
  sent_by: string | null;
  /**
   * The announcement this row was one copy of (#1317), or null for a message
   * written to one person. Every copy of one announcement carries the same
   * value, which is the only thing that distinguishes fifty sends of the same
   * notice from fifty unrelated messages that happen to share a subject.
   */
  batch_id: string | null;
};

export type MessageActor = {
  user_id: string;
  email: string | null;
  full_name: string | null;
};

/**
 * A page's worth of message history: every record's messages, and the names
 * behind every `sent_by` in them. `loadRecordMessages()`
 * (`@/lib/portal/record-messages`) is what fills it.
 *
 * `byRecord` is keyed by `record_id`, and a record with no history is absent
 * rather than empty. A plain object rather than a Map because two of the three
 * callers hand it through a client component, and this is what the RSC
 * boundary takes without anyone having to think about it.
 */
export type RecordMessages = {
  byRecord: Record<string, RecordMessageRow[]>;
  actors: MessageActor[];
};

/** Nothing sent, and nobody to name: what a reader without the module's
 * `manage` sees, and what a caller passes instead of loading a page's worth
 * it will not render. */
export const NO_RECORD_MESSAGES: RecordMessages = { byRecord: {}, actors: [] };

/**
 * The outcome at send time. `skipped` is not here: nothing was sent, so no row
 * is written.
 */
export type OutboundMessageStatus = "sent" | "failed";

export function outboundMessageStatusLabel(status: string): string {
  return status === "sent" ? "Sent" : "Not sent";
}

/**
 * Who sent this, and what sort of thing it was, in one line under the subject.
 *
 * Three kinds reach a history card and they are not interchangeable. A
 * `staff_message` is somebody's own words. An announcement is somebody's own
 * words posted to everyone registered, and a registrant reading their history
 * with a manager should be able to tell the two apart -- "why did I get this?"
 * is exactly the question the card exists to answer. Anything else is a
 * receipt the organization wrote, which a staffer only re-sent.
 */
export function outboundMessageSenderLabel(
  kind: string,
  senderName: string,
): string {
  if (kind === STAFF_MESSAGE_KIND) return `Sent by ${senderName}`;
  if (kind === EVENT_ANNOUNCEMENT_KIND) {
    return `Announcement, sent by ${senderName}`;
  }
  return `Receipt, resent by ${senderName}`;
}

/** Matches the `StatusBadge` tones the portal already uses. */
export function outboundMessageStatusTone(
  status: string,
): "success" | "danger" {
  return status === "sent" ? "success" : "danger";
}

/**
 * What a resend appends to the receipt's dedupe key so it is not read as the
 * first send's duplicate.
 *
 * The minute is the whole design. The first send claimed
 * `gear_request_confirmation:<id>`; a second insert with that key raises 23505
 * and deliverEmail() returns `skipped`, which at the call site is
 * indistinguishable from success -- so a resend with the original key silently
 * does nothing. Keying on the minute lets a receipt be sent again tomorrow
 * while making a double-click inside the same minute the no-op it should be.
 *
 * Always built from the server's clock. A client-supplied minute would let a
 * caller send the same receipt as often as it liked.
 */
export function resendDedupeSuffix(now: Date = new Date()): string {
  return `resend:${now.toISOString().slice(0, 16)}`;
}

/**
 * Why a queue's message buttons are off, in a sentence, rather than simply
 * being absent (#1203, shared in #1204).
 *
 * A person whose record the retention purge cleared and an organization that
 * has switched outbound email off look identical from the card, and the
 * difference decides whether there is anything to be done about it. The
 * address sentence is each queue's own, because only it can say which record
 * is missing what.
 */
export function messagingDisabledReason(
  orgEmailEnabled: boolean,
  toEmail: string | null | undefined,
  noAddressReason: string,
): string | undefined {
  if (!orgEmailEnabled) {
    return "Outbound email is switched off for this organization.";
  }
  if (!toEmail?.trim()) return noAddressReason;
  return undefined;
}
