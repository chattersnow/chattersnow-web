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

/** Matching the check constraints on `outbound_messages`. */
export const MAX_MESSAGE_SUBJECT_LENGTH = 200;
export const MAX_MESSAGE_BODY_LENGTH = 5000;

/** What `outbound_messages.record_type` holds for a public gear request. */
export const GEAR_REQUEST_RECORD_TYPE = "gear_request";

/**
 * The outcome at send time. `skipped` is not here: nothing was sent, so no row
 * is written.
 */
export type OutboundMessageStatus = "sent" | "failed";

export function outboundMessageStatusLabel(status: string): string {
  return status === "sent" ? "Sent" : "Not sent";
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
