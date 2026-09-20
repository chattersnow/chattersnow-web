/**
 * Writing to everybody registered for an event (#1317): who the notice goes
 * to, how many that turns out to be, and how the sends are read back as one
 * announcement rather than fifty messages.
 *
 * Zero runtime imports, like `@/lib/outbound-messages` next to it: the composer
 * that counts the audience before a staffer commits to it is a client
 * component, and the action that resolves the same audience for real is
 * `server-only`. Both have to agree exactly -- a dialog that says "37 people"
 * and an action that mails 39 is worse than no count at all -- so the rule
 * lives here once and neither owns it.
 */

import {
  EVENT_ANNOUNCEMENT_KIND,
  type RecordMessages,
  type RecordMessageRow,
} from "@/lib/outbound-messages";

/**
 * The most people one announcement may reach, and the reason it is fifty.
 *
 * The whole platform sends through one Resend account on the free plan: a
 * hundred emails a day across every tenant, and a couple of requests a second.
 * That makes the cap the feature's central constraint rather than a footnote --
 * one unbounded announcement could spend a day's allowance for every other
 * tenant, including the receipts a registrant is waiting on.
 *
 * Fifty leaves half the day's budget for everything triggered by somebody
 * other than a staffer. On a paid plan this is the one number to raise;
 * nothing else in the design assumes it.
 */
export const MAX_ANNOUNCEMENT_RECIPIENTS = 50;

/**
 * How long to wait between two sends in a batch.
 *
 * Resend's default rate limit is two requests a second, and each recipient
 * costs more than one request -- deliverEmail() claims a ledger row, sends,
 * then finalizes. Spacing the loop rather than racing it keeps a fifty-person
 * announcement inside both that limit and the serverless function's duration
 * (fifty times this is well under a minute).
 */
export const ANNOUNCEMENT_SEND_INTERVAL_MS = 600;

export const ANNOUNCEMENT_AUDIENCES = [
  "everyone",
  "not_checked_in",
  "checked_in",
] as const;

export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

export function isAnnouncementAudience(
  value: unknown,
): value is AnnouncementAudience {
  return (ANNOUNCEMENT_AUDIENCES as readonly unknown[]).includes(value);
}

export function announcementAudienceLabel(
  audience: AnnouncementAudience,
): string {
  switch (audience) {
    case "checked_in":
      return "Everyone checked in";
    case "not_checked_in":
      return "Everyone not checked in";
    default:
      return "Everyone registered";
  }
}

/** The part of a registration that decides whether it is written to. */
export type AudienceRegistration = {
  id: string;
  name: string;
  email: string | null;
  person_id: string | null;
  checked_in_at: string | null;
};

export type AnnouncementRecipient = {
  registrationId: string;
  name: string;
  email: string;
  personId: string | null;
};

export type ResolvedAudience = {
  /** One per email address, in the order they registered. */
  recipients: AnnouncementRecipient[];
  /** Registrations in the audience with nobody to write to. */
  withoutAddress: number;
  /** Extra registrations collapsed onto an address already in the list. */
  duplicates: number;
};

/**
 * Who this announcement actually reaches.
 *
 * Two reductions, both of which change the number on screen and so have to
 * happen before the staffer commits rather than inside the send loop:
 *
 * A registration with no address is excluded and counted, not silently
 * dropped. Retention anonymizes a registration in place -- `email = ''` --
 * and a staff-added walk-in may never have had one, so "37 people; 2
 * registrations have no address" is the honest answer and "39" is not.
 *
 * Addresses are collapsed on `lower(trim(email))`, so somebody who registered
 * twice -- for themselves and again for a friend -- gets one copy. The first
 * registration wins, because it is the one whose id the dedupe key and the
 * history row are built from, and the announcement has to land somewhere.
 */
export function resolveAnnouncementAudience(
  registrations: readonly AudienceRegistration[],
  audience: AnnouncementAudience,
): ResolvedAudience {
  const inAudience = registrations.filter((registration) => {
    if (audience === "checked_in") return registration.checked_in_at !== null;
    if (audience === "not_checked_in") {
      return registration.checked_in_at === null;
    }
    return true;
  });

  const recipients: AnnouncementRecipient[] = [];
  const seen = new Set<string>();
  let withoutAddress = 0;
  let duplicates = 0;

  for (const registration of inAudience) {
    const email = (registration.email ?? "").trim();
    if (!email) {
      withoutAddress += 1;
      continue;
    }
    const key = email.toLowerCase();
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    recipients.push({
      registrationId: registration.id,
      name: (registration.name ?? "").trim(),
      email,
      personId: registration.person_id,
    });
  }

  return { recipients, withoutAddress, duplicates };
}

/**
 * The sentence the composer shows before the send, because the count is the
 * part that cannot be taken back.
 *
 * It leads with the number of emails and then accounts for every registration
 * that is not one of them, so the figure can be reconciled against the list on
 * screen without anybody having to guess why it is smaller.
 */
export function describeAnnouncementAudience(
  resolved: ResolvedAudience,
): string {
  const count = resolved.recipients.length;
  const head =
    count === 0
      ? "This will email nobody"
      : `This will email ${count} ${count === 1 ? "person" : "people"}`;

  const notes: string[] = [];
  if (resolved.withoutAddress > 0) {
    notes.push(
      `${resolved.withoutAddress} ${
        resolved.withoutAddress === 1
          ? "registration has"
          : "registrations have"
      } no address`,
    );
  }
  if (resolved.duplicates > 0) {
    notes.push(
      `${resolved.duplicates} duplicate ${
        resolved.duplicates === 1 ? "address was" : "addresses were"
      } collapsed`,
    );
  }

  return notes.length > 0 ? `${head}; ${notes.join("; ")}.` : `${head}.`;
}

export const ANNOUNCEMENT_ERRORS = {
  NO_RECIPIENTS:
    "Nobody in that audience has an email address, so there is nothing to send.",
  TOO_MANY: `An announcement can reach ${MAX_ANNOUNCEMENT_RECIPIENTS} people at most, because this organization's email is on a plan with a daily cap. Narrow the audience and send again.`,
  AUDIENCE_INVALID: "Choose who this announcement is for.",
} as const;

/**
 * Why this audience cannot be sent to, or undefined when it can. Read by both
 * the composer -- which disables its button -- and the action, which is the
 * one that has to be right.
 */
export function announcementRefusal(
  resolved: ResolvedAudience,
): string | undefined {
  if (resolved.recipients.length === 0) {
    return ANNOUNCEMENT_ERRORS.NO_RECIPIENTS;
  }
  if (resolved.recipients.length > MAX_ANNOUNCEMENT_RECIPIENTS) {
    return ANNOUNCEMENT_ERRORS.TOO_MANY;
  }
  return undefined;
}

/**
 * What makes one copy of an announcement unique in the delivery ledger.
 *
 * Per registration, never one key for the batch, and all three reasons are
 * load-bearing. `notification_deliveries` is unique on
 * (tenant_id, person_id, kind, dedupe_key), so a registration with a null
 * `person_id` would dedupe against nothing under a shared key and a retried
 * action would mail those people a second time. findDeliveryId() resolves a
 * history row's `delivery_id` with `.maybeSingle()` on that same tuple, which
 * a shared key would make ambiguous and lose (#1310). And the Email Delivery
 * log filters on `dedupe_key` with an `ilike`, so the registration id has to
 * appear in the key for a delivery to be findable from the record it is about.
 */
export function eventAnnouncementDedupeKey(
  registrationId: string,
  batchId: string,
): string {
  return `${EVENT_ANNOUNCEMENT_KIND}:${registrationId}:${batchId}`;
}

/** One announcement, as the registrants tab lists it. */
export type AnnouncementBatch = {
  batchId: string;
  subject: string;
  /** The auth.users id of whoever sent it, or null if the row lost it. */
  sentBy: string | null;
  /** The earliest send in the batch: when the announcement went out. */
  sentAt: string;
  sent: number;
  failed: number;
};

/**
 * The announcements behind a page of registrant history, newest first.
 *
 * Derived from the rows the history card already loaded rather than queried
 * again: an announcement *is* its per-registration rows, so grouping them is
 * the whole of the event-level view and a second query would only be the same
 * rows counted by the database instead.
 *
 * Rows with no `batch_id` are the one-to-one messages and are not
 * announcements, so they fall out here.
 */
export function announcementBatches(
  messages: RecordMessages,
): AnnouncementBatch[] {
  const byBatch = new Map<string, AnnouncementBatch>();

  for (const row of Object.values(messages.byRecord).flat()) {
    if (!row.batch_id) continue;
    const existing = byBatch.get(row.batch_id);
    if (!existing) {
      byBatch.set(row.batch_id, {
        batchId: row.batch_id,
        subject: row.subject,
        sentBy: row.sent_by,
        sentAt: row.created_at,
        sent: countsAs(row, "sent"),
        failed: countsAs(row, "failed"),
      });
      continue;
    }
    existing.sent += countsAs(row, "sent");
    existing.failed += countsAs(row, "failed");
    // The send loop writes one row per recipient over several seconds, so the
    // batch's time is its first row's rather than whichever arrived last.
    if (row.created_at < existing.sentAt) existing.sentAt = row.created_at;
  }

  return [...byBatch.values()].sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

function countsAs(row: RecordMessageRow, status: string): number {
  return row.status === status ? 1 : 0;
}
