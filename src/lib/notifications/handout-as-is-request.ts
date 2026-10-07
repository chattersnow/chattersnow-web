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
  DISTRIBUTION_ACKNOWLEDGEMENT_RECORD_TYPE,
  GEAR_AS_IS_REQUEST_KIND,
} from "@/lib/outbound-messages";
import { AS_IS_LINK_DAYS } from "@/lib/gear-request-as-is-requests";
import {
  acknowledgementPath,
  handoutAsIsRequestSubject,
} from "@/lib/distribution-acknowledgement";
import { lexiconForTenant } from "@/lib/tenant-lexicon";

/**
 * Mails a handout's recipient their link to acknowledge the as-is terms
 * afterwards (#1519), once record_distribution_draft() has recorded the
 * handout with a reason and stored the link's hash.
 *
 * sendGearAsIsRequests()'s shape (#1518) for one recipient: the same email in
 * its handout wording, recorded in the delivery ledger against the
 * acknowledgement. A send that does not go out withdraws its link, so the
 * handout never reads as asked when nobody was.
 */

export type HandoutAsIsRequest = {
  tenantId: string;
  acknowledgementId: string;
  recipient: { personId: string; name: string; email: string };
  eventName: string | null;
  /** The raw token, which exists only here and in the email. */
  token: string;
  tokenHash: string;
  /** The staffer's auth.users id. */
  sentBy: string;
  fallbackOrigin: string;
};

export async function sendHandoutAsIsRequest(
  admin: SupabaseClient,
  request: HandoutAsIsRequest,
): Promise<DeliveryOutcome> {
  if (!(await isOrgEmailEnabled(admin, request.tenantId))) {
    await withdraw(admin, request.tokenHash);
    return "skipped";
  }

  const [mail, lexicon] = await Promise.all([
    tenantMailContext(admin, request.tenantId, {
      fallbackOrigin: request.fallbackOrigin,
    }),
    lexiconForTenant(admin, request.tenantId),
  ]);
  const origin = mail.origin.replace(/\/+$/, "");
  const subject = handoutAsIsRequestSubject(lexicon.item_plural);
  const dedupeKey = `${GEAR_AS_IS_REQUEST_KIND}:handout:${request.acknowledgementId}`;

  let outcome: DeliveryOutcome;
  try {
    outcome = await deliverEmail(admin, {
      tenantId: request.tenantId,
      personId: request.recipient.personId,
      identity: mail.identity,
      kind: GEAR_AS_IS_REQUEST_KIND,
      dedupeKey,
      to: request.recipient.email,
      render: () =>
        renderGearAsIsRequestEmail({
          orgName: mail.displayName,
          firstName: request.recipient.name.split(/\s+/)[0] ?? "",
          itemPlural: lexicon.item_plural.toLowerCase(),
          url: `${origin}${acknowledgementPath(request.token)}`,
          linkDays: AS_IS_LINK_DAYS,
          siteUrl: mail.origin,
          branding: mail.branding,
          subject,
          handout: { eventName: request.eventName },
        }),
      logPrefix: "[handout-as-is-request]",
    });
  } catch (error) {
    console.error("[handout-as-is-request] the send threw", error);
    outcome = "failed";
  }

  if (outcome !== "sent") await withdraw(admin, request.tokenHash);
  if (outcome === "skipped") return outcome;

  await recordOutboundMessage(admin, {
    messageId: crypto.randomUUID(),
    tenantId: request.tenantId,
    personId: request.recipient.personId,
    toEmail: request.recipient.email,
    module: "inventory",
    recordType: DISTRIBUTION_ACKNOWLEDGEMENT_RECORD_TYPE,
    recordId: request.acknowledgementId,
    subject,
    body: "",
    kind: GEAR_AS_IS_REQUEST_KIND,
    dedupeKey,
    status: outcome,
    sentBy: request.sentBy,
  });
  return outcome;
}

async function withdraw(admin: SupabaseClient, tokenHash: string) {
  const { error } = await admin
    .from("distribution_acknowledgement_requests")
    .delete()
    .eq("token_hash", tokenHash);
  if (error) {
    console.error(
      "[handout-as-is-request] could not withdraw an unsent link",
      error,
    );
  }
}
