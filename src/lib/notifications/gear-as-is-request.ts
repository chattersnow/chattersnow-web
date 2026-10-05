import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deliverEmail,
  type DeliveryOutcome,
} from "@/lib/notifications/deliver";
import { tenantMailContext } from "@/lib/email/identity";
import { isOrgEmailEnabled } from "@/lib/notifications/settings";
import { recordOutboundMessage } from "@/lib/notifications/outbound-messages";
import { renderGearAsIsRequestEmail } from "@/lib/notifications/gear-as-is-request-email";
import {
  GEAR_AS_IS_REQUEST_KIND,
  GEAR_REQUEST_RECORD_TYPE,
} from "@/lib/outbound-messages";
import { ANNOUNCEMENT_SEND_INTERVAL_MS } from "@/lib/event-announcements";
import {
  AS_IS_LINK_DAYS,
  asIsRequestSubject,
  gearAsIsRequestDedupeKey,
  type AsIsRequestRecipient,
} from "@/lib/gear-request-as-is-requests";
import { acknowledgementPath } from "@/lib/distribution-acknowledgement";
import { lexiconForTenant } from "@/lib/tenant-lexicon";

/**
 * Mails each requester their own link to acknowledge the as-is terms (#1518),
 * after the action has minted the tokens and stored their hashes.
 *
 * sendRegistrationAnswersRequests()'s shape (#1502): one tenant, one mail
 * context, a spaced sequential loop, each outcome recorded in that request's
 * message history. Runs on the service-role client and throws at nobody.
 *
 * A send that FAILS withdraws its link, by its hash, so the request does not
 * read "Asked" for somebody who was never asked.
 */

export type AsIsRequestRecipientWithToken = AsIsRequestRecipient & {
  /** The raw token, which exists only here and in the email. */
  token: string;
  tokenHash: string;
};

export type GearAsIsRequestBatch = {
  tenantId: string;
  batchId: string;
  recipients: readonly AsIsRequestRecipientWithToken[];
  /** The staffer's auth.users id. */
  sentBy: string;
  fallbackOrigin: string;
};

export type GearAsIsRequestSummary = {
  sent: number;
  skipped: number;
  failed: number;
};

export async function sendGearAsIsRequests(
  admin: SupabaseClient,
  batch: GearAsIsRequestBatch,
): Promise<GearAsIsRequestSummary> {
  const summary: GearAsIsRequestSummary = { sent: 0, skipped: 0, failed: 0 };

  if (!(await isOrgEmailEnabled(admin, batch.tenantId))) {
    summary.skipped = batch.recipients.length;
    await withdraw(
      admin,
      batch.recipients.map((recipient) => recipient.tokenHash),
    );
    return summary;
  }

  const [mail, lexicon] = await Promise.all([
    tenantMailContext(admin, batch.tenantId, {
      fallbackOrigin: batch.fallbackOrigin,
    }),
    lexiconForTenant(admin, batch.tenantId),
  ]);
  const origin = mail.origin.replace(/\/+$/, "");
  const subject = asIsRequestSubject(lexicon.collection);

  for (const [index, recipient] of batch.recipients.entries()) {
    if (index > 0) await pause(ANNOUNCEMENT_SEND_INTERVAL_MS);

    const dedupeKey = gearAsIsRequestDedupeKey(
      recipient.requestId,
      batch.batchId,
    );

    let outcome: DeliveryOutcome;
    try {
      outcome = await deliverEmail(admin, {
        tenantId: batch.tenantId,
        personId: recipient.personId,
        identity: mail.identity,
        kind: GEAR_AS_IS_REQUEST_KIND,
        dedupeKey,
        to: recipient.email,
        render: () =>
          renderGearAsIsRequestEmail({
            orgName: mail.displayName,
            firstName: recipient.name.split(/\s+/)[0] ?? "",
            itemPlural: lexicon.item_plural.toLowerCase(),
            url: `${origin}${acknowledgementPath(recipient.token)}`,
            linkDays: AS_IS_LINK_DAYS,
            siteUrl: mail.origin,
            branding: mail.branding,
            subject,
          }),
        logPrefix: "[gear-as-is-request]",
      });
    } catch (error) {
      console.error("[gear-as-is-request] the send threw", error);
      outcome = "failed";
    }

    if (outcome === "skipped") {
      summary.skipped += 1;
      await withdraw(admin, [recipient.tokenHash]);
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
      module: "inventory",
      recordType: GEAR_REQUEST_RECORD_TYPE,
      recordId: recipient.requestId,
      subject,
      body: "",
      kind: GEAR_AS_IS_REQUEST_KIND,
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
    .from("gear_request_acknowledgement_requests")
    .delete()
    .in("token_hash", tokenHashes);
  if (error) {
    console.error(
      "[gear-as-is-request] could not withdraw an unsent link",
      error,
    );
  }
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
