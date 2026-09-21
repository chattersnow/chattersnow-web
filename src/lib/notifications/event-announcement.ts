import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deliverEmail } from "@/lib/notifications/deliver";
import { tenantMailContext } from "@/lib/email/identity";
import { isOrgEmailEnabled } from "@/lib/notifications/settings";
import { renderStaffMessageEmail } from "@/lib/notifications/staff-message-email";
import { recordOutboundMessage } from "@/lib/notifications/outbound-messages";
import {
  EVENT_ANNOUNCEMENT_KIND,
  EVENT_REGISTRATION_RECORD_TYPE,
} from "@/lib/outbound-messages";
import {
  ANNOUNCEMENT_SEND_INTERVAL_MS,
  eventAnnouncementDedupeKey,
  type AnnouncementRecipient,
} from "@/lib/event-announcements";
import { publicEventPath } from "@/app/(public)/events/event-path";

/**
 * One notice, to everybody registered for an event (#1317).
 *
 * The first send in this application with an audience a staff member chose.
 * Everything else that reaches more than one person -- the task digest, the
 * submission notices, the ops report -- is addressed to whoever holds a role,
 * which the database answers. This one is addressed to a list somebody looked
 * at and decided on, and that difference is why the cap, the count shown
 * before the send and the per-recipient history all exist.
 *
 * Modelled on notifyRoleHolders(): one tenant, one mail context, then a
 * sequential loop that tallies each recipient's own outcome. Sequential rather
 * than concurrent on purpose -- the free Resend plan's rate limit is a couple
 * of requests a second and each recipient costs several -- and spaced by
 * ANNOUNCEMENT_SEND_INTERVAL_MS so a full batch stays inside both that limit
 * and the function's duration.
 *
 * Resend's batch endpoint would be one request for the lot, and is deliberately
 * not used: it bypasses deliverEmail()'s ledger row and its per-recipient
 * outcome, which are the two things the history card is made of.
 *
 * Runs on the service-role client, after the response has gone. Nothing here
 * may throw at a caller who is no longer listening; every failure is a tally
 * and a log line, and the history card is where the result is read.
 */

export type EventAnnouncementRequest = {
  tenantId: string;
  eventId: string;
  eventName: string;
  /**
   * Minted by the composer and shared by every copy. It is half of each
   * recipient's dedupe key, so a retried Server Action loses the
   * unique-constraint race per registration and sends nothing twice.
   */
  batchId: string;
  subject: string;
  body: string;
  recipients: readonly AnnouncementRecipient[];
  /** The staffer's auth.users id. */
  sentBy: string;
  fallbackOrigin: string;
};

export type EventAnnouncementSummary = {
  sent: number;
  /** Already sent under this batch id, or muted by the org switch. */
  skipped: number;
  failed: number;
};

export async function sendEventAnnouncement(
  admin: SupabaseClient,
  request: EventAnnouncementRequest,
): Promise<EventAnnouncementSummary> {
  const summary: EventAnnouncementSummary = { sent: 0, skipped: 0, failed: 0 };

  // Checked again here even though the action refused an off switch before it
  // answered the staffer: this runs after the response, minutes may have
  // passed on a long batch, and the switch is the one gate that must not be
  // satisfied by a stale read.
  if (!(await isOrgEmailEnabled(admin, request.tenantId))) {
    summary.skipped = request.recipients.length;
    return summary;
  }

  const mail = await tenantMailContext(admin, request.tenantId, {
    fallbackOrigin: request.fallbackOrigin,
  });
  const eventUrl = `${mail.origin.replace(/\/+$/, "")}${publicEventPath(request.eventId)}`;

  for (const [index, recipient] of request.recipients.entries()) {
    // Between sends, never before the first or after the last: the pause is
    // there to space the provider's requests apart, and paying it at either
    // end would only lengthen the run.
    if (index > 0) await pause(ANNOUNCEMENT_SEND_INTERVAL_MS);

    const dedupeKey = eventAnnouncementDedupeKey(
      recipient.registrationId,
      request.batchId,
    );

    const outcome = await deliverEmail(admin, {
      tenantId: request.tenantId,
      personId: recipient.personId,
      identity: mail.identity,
      kind: EVENT_ANNOUNCEMENT_KIND,
      dedupeKey,
      to: recipient.email,
      render: () =>
        renderStaffMessageEmail({
          orgName: mail.displayName,
          recipientName: recipient.name,
          subject: request.subject,
          body: request.body,
          siteUrl: mail.origin,
          branding: mail.branding,
          // Why this arrived unasked-for, first thing. A one-to-one reply
          // needs no such line; a notice to a list does.
          about: {
            text: `About ${request.eventName}`,
            url: eventUrl,
          },
        }),
      logPrefix: "[event-announcement]",
    });

    if (outcome === "skipped") {
      summary.skipped += 1;
      continue;
    }
    if (outcome === "sent") summary.sent += 1;
    else summary.failed += 1;

    // Per recipient, sharing the batch id: the registrant's own history shows
    // the announcement they got beside anything written to them personally,
    // and the event-level card is the same rows grouped.
    await recordOutboundMessage(admin, {
      messageId: crypto.randomUUID(),
      tenantId: request.tenantId,
      personId: recipient.personId,
      toEmail: recipient.email,
      module: "events",
      recordType: EVENT_REGISTRATION_RECORD_TYPE,
      recordId: recipient.registrationId,
      subject: request.subject,
      body: request.body,
      kind: EVENT_ANNOUNCEMENT_KIND,
      dedupeKey,
      batchId: request.batchId,
      status: outcome,
      sentBy: request.sentBy,
    });
  }

  return summary;
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
