import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deliverEmail,
  type DeliveryOutcome,
} from "@/lib/notifications/deliver";
import { tenantMailContext } from "@/lib/email/identity";
import { isOrgEmailEnabled } from "@/lib/notifications/settings";
import { recordOutboundMessage } from "@/lib/notifications/outbound-messages";
import { renderRegistrationAnswersRequestEmail } from "@/lib/notifications/registration-answers-request-email";
import {
  EVENT_REGISTRATION_RECORD_TYPE,
  REGISTRATION_ANSWERS_REQUEST_KIND,
} from "@/lib/outbound-messages";
import { ANNOUNCEMENT_SEND_INTERVAL_MS } from "@/lib/event-announcements";
import {
  registrationAnswersRequestDedupeKey,
  type AnswerRequestRecipient,
} from "@/lib/registration-answer-requests";
import { publicEventAnswersPath } from "@/app/(public)/events/event-path";

/**
 * Mails each registrant their own link to an event's registration questions
 * (#1502), after the action has minted the tokens and stored their hashes.
 *
 * Modelled on sendEventAnnouncement(): one tenant, one mail context, then a
 * sequential, spaced loop that tallies each recipient's own outcome and
 * records it in that registration's message history. Runs on the
 * service-role client, after the response for a bulk send, so nothing here
 * throws at a caller.
 *
 * A send that FAILS withdraws its link. The request row was written before the
 * mail so the link works the moment it arrives; left behind after a failure it
 * would show "Asked" for somebody who was never asked, and the "recently
 * asked" guard would skip them on the next try. Deleted by its hash, so a
 * newer request for the same registration is never the one removed.
 */

export type AnswersRequestRecipientWithToken = AnswerRequestRecipient & {
  /** The raw token, which exists only here and in the email. */
  token: string;
  tokenHash: string;
};

export type RegistrationAnswersRequestBatch = {
  tenantId: string;
  eventId: string;
  eventName: string;
  timeZone: string;
  expiresAt: string;
  /** Half of each recipient's dedupe key; see the dedupe key's comment. */
  batchId: string;
  subject: string;
  intro: string;
  recipients: readonly AnswersRequestRecipientWithToken[];
  /** The staffer's auth.users id. */
  sentBy: string;
  fallbackOrigin: string;
};

export type RegistrationAnswersRequestSummary = {
  sent: number;
  skipped: number;
  failed: number;
};

export async function sendRegistrationAnswersRequests(
  admin: SupabaseClient,
  batch: RegistrationAnswersRequestBatch,
): Promise<RegistrationAnswersRequestSummary> {
  const summary: RegistrationAnswersRequestSummary = {
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  // Again here, for sendEventAnnouncement()'s reason: a bulk send runs after
  // the response, and the switch must not be satisfied by a stale read.
  if (!(await isOrgEmailEnabled(admin, batch.tenantId))) {
    summary.skipped = batch.recipients.length;
    await withdraw(
      admin,
      batch.recipients.map((recipient) => recipient.tokenHash),
    );
    return summary;
  }

  const mail = await tenantMailContext(admin, batch.tenantId, {
    fallbackOrigin: batch.fallbackOrigin,
  });
  const origin = mail.origin.replace(/\/+$/, "");

  for (const [index, recipient] of batch.recipients.entries()) {
    if (index > 0) await pause(ANNOUNCEMENT_SEND_INTERVAL_MS);

    const dedupeKey = registrationAnswersRequestDedupeKey(
      recipient.registrationId,
      batch.batchId,
    );

    let outcome: DeliveryOutcome;
    try {
      outcome = await deliverEmail(admin, {
        tenantId: batch.tenantId,
        personId: recipient.personId,
        identity: mail.identity,
        kind: REGISTRATION_ANSWERS_REQUEST_KIND,
        dedupeKey,
        to: recipient.email,
        render: () =>
          renderRegistrationAnswersRequestEmail({
            orgName: mail.displayName,
            firstName: recipient.name.split(/\s+/)[0] ?? "",
            eventName: batch.eventName,
            intro: batch.intro,
            url: `${origin}${publicEventAnswersPath(batch.eventId, recipient.token)}`,
            expiresAt: batch.expiresAt,
            timeZone: batch.timeZone,
            siteUrl: mail.origin,
            branding: mail.branding,
            subject: batch.subject,
          }),
        logPrefix: "[registration-answers-request]",
      });
    } catch (error) {
      console.error("[registration-answers-request] the send threw", error);
      outcome = "failed";
    }

    if (outcome === "skipped") {
      summary.skipped += 1;
      continue;
    }
    if (outcome === "sent") summary.sent += 1;
    else {
      summary.failed += 1;
      await withdraw(admin, [recipient.tokenHash]);
    }

    await recordOutboundMessage(admin, {
      messageId: crypto.randomUUID(),
      tenantId: batch.tenantId,
      personId: recipient.personId,
      toEmail: recipient.email,
      module: "events",
      recordType: EVENT_REGISTRATION_RECORD_TYPE,
      recordId: recipient.registrationId,
      subject: batch.subject,
      body: batch.intro,
      kind: REGISTRATION_ANSWERS_REQUEST_KIND,
      dedupeKey,
      status: outcome,
      sentBy: batch.sentBy,
    });
  }

  return summary;
}

async function withdraw(
  admin: SupabaseClient,
  tokenHashes: readonly string[],
): Promise<void> {
  if (tokenHashes.length === 0) return;
  const { error } = await admin
    .from("event_registration_answer_requests")
    .delete()
    .in("token_hash", tokenHashes);
  if (error) {
    console.error(
      "[registration-answers-request] could not withdraw an unsent link",
      error,
    );
  }
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
