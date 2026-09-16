import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deliverEmail,
  type DeliveryOutcome,
} from "@/lib/notifications/deliver";
import { tenantMailContext } from "@/lib/email/identity";
import { isOrgEmailEnabled } from "@/lib/notifications/settings";
import { renderStaffMessageEmail } from "@/lib/notifications/staff-message-email";
import { recordOutboundMessage } from "@/lib/notifications/outbound-messages";
import { STAFF_MESSAGE_KIND } from "@/lib/outbound-messages";

/**
 * The first send in this application that a person, rather than an event,
 * decides to make (#1203).
 *
 * Everything else here is triggered by a form submit, an account change or a
 * cron. This one is triggered by a staff member writing to somebody about a
 * record they are looking at, which is why it takes the module and the record
 * as arguments and knows nothing about what either of them is: the gear
 * request detail is its first caller, and #1204's volunteer applications and
 * contact messages are the same call with different strings.
 *
 * Gated by the org-wide kill switch and by nothing else. `staff_message` is
 * not a registered notification kind, so hasOptedOut() never suppresses it --
 * see `@/lib/outbound-messages` for why that asymmetry is the design and not
 * an omission.
 */

export type StaffMessageRequest = {
  /**
   * Minted by the composer when the dialog opens, not here. It is the dedupe
   * key, so a double-click or a retried Server Action sends the second copy
   * into notification_deliveries' unique constraint and stops.
   */
  messageId: string;
  tenantId: string;
  /** Null when the recipient has no people row (#1204's contact messages). */
  personId: string | null;
  toEmail: string;
  recipientName: string;
  module: string;
  recordType: string;
  recordId: string;
  subject: string;
  body: string;
  /** The staffer's auth.users id. */
  sentBy: string;
  fallbackOrigin: string;
};

export function staffMessageDedupeKey(messageId: string): string {
  return `${STAFF_MESSAGE_KIND}:${messageId}`;
}

export async function sendStaffMessage(
  admin: SupabaseClient,
  request: StaffMessageRequest,
): Promise<DeliveryOutcome> {
  if (!(await isOrgEmailEnabled(admin, request.tenantId))) return "skipped";

  const mail = await tenantMailContext(admin, request.tenantId, {
    fallbackOrigin: request.fallbackOrigin,
  });
  const dedupeKey = staffMessageDedupeKey(request.messageId);

  const outcome = await deliverEmail(admin, {
    tenantId: request.tenantId,
    personId: request.personId,
    identity: mail.identity,
    kind: STAFF_MESSAGE_KIND,
    dedupeKey,
    to: request.toEmail,
    render: () =>
      renderStaffMessageEmail({
        orgName: mail.displayName,
        recipientName: request.recipientName,
        subject: request.subject,
        body: request.body,
      }),
    logPrefix: "[staff-message]",
  });

  // A skipped send writes no row: either the switch is off or this message has
  // already been sent under this id, and in neither case did anything go out
  // that a history card should claim.
  if (outcome === "skipped") return outcome;

  await recordOutboundMessage(admin, {
    messageId: request.messageId,
    tenantId: request.tenantId,
    personId: request.personId,
    toEmail: request.toEmail,
    module: request.module,
    recordType: request.recordType,
    recordId: request.recordId,
    subject: request.subject,
    body: request.body,
    kind: STAFF_MESSAGE_KIND,
    dedupeKey,
    status: outcome,
    sentBy: request.sentBy,
  });

  return outcome;
}
