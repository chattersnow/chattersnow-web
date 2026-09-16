import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tenantMailContext } from "@/lib/email/identity";
import {
  deliverEmail,
  type DeliveryOutcome,
} from "@/lib/notifications/deliver";
import { isOrgEmailEnabled } from "@/lib/notifications/settings";
import {
  renderEmailChanged,
  renderEmailChangeConfirmation,
} from "@/lib/notifications/email-change-emails";
import type { EmailChangeConfirmationRequest } from "@/lib/constituent/email-change";

/**
 * The two sends behind a record's own address change (#1164).
 *
 * Both go through deliverEmail() like every other sender, so they are claimed
 * in notification_deliveries before they are sent and a retried Server Action
 * resolves on the unique constraint rather than mailing twice. Neither kind
 * appears in NOTIFICATION_KINDS, for the reason #1049's pair does not: a
 * switch offering to turn off the message that proves you hold an address, or
 * the one that tells you your record's address has moved, would be a setting
 * whose only use is to hide a change from the person it happened to.
 *
 * The org-wide kill switch does govern them, which is the rule worth keeping
 * absolute: when an organization has email turned off, nothing leaves this
 * application. A pending address in a tenant with email off simply stays
 * pending, which is truthful -- with nothing being sent, nothing has moved.
 */

export const EMAIL_CHANGE_CONFIRMATION_KIND = "email_change_confirmation";

export const EMAIL_CHANGED_KIND = "email_changed";

/**
 * Keyed on the token's hash rather than the address: asking again mints a new
 * token and should reach the mailbox again, while two clicks on one link
 * should not.
 */
export function emailChangeConfirmationDedupeKey(tokenHash: string): string {
  return `email-change-confirm:${tokenHash}`;
}

export function emailChangedDedupeKey(tokenHash: string): string {
  return `email-changed:${tokenHash}`;
}

export async function sendEmailChangeConfirmation(
  admin: SupabaseClient,
  request: EmailChangeConfirmationRequest,
): Promise<DeliveryOutcome> {
  if (!(await isOrgEmailEnabled(admin, request.tenantId))) return "skipped";

  const mail = await tenantMailContext(admin, request.tenantId, {
    fallbackOrigin: request.fallbackOrigin,
  });

  return deliverEmail(admin, {
    tenantId: request.tenantId,
    personId: request.personId,
    identity: mail.identity,
    kind: EMAIL_CHANGE_CONFIRMATION_KIND,
    dedupeKey: emailChangeConfirmationDedupeKey(request.tokenHash),
    to: request.pendingEmail,
    render: () =>
      renderEmailChangeConfirmation({
        orgName: mail.displayName,
        personName: request.personName,
        token: request.token,
        expiresAt: request.expiresAt,
        siteUrl: mail.origin,
      }),
    logPrefix: "[email-change]",
  });
}

export async function sendEmailChanged(
  admin: SupabaseClient,
  request: {
    tenantId: string;
    personId: string;
    /** What was on the record until the confirmation landed. */
    previousEmail: string | null;
    confirmedEmail: string;
    tokenHash: string;
    fallbackOrigin: string;
  },
): Promise<DeliveryOutcome> {
  // Nothing to tell: the record had no address, or it had this one.
  if (
    !request.previousEmail ||
    request.previousEmail.toLowerCase() === request.confirmedEmail.toLowerCase()
  ) {
    return "skipped";
  }

  if (!(await isOrgEmailEnabled(admin, request.tenantId))) return "skipped";

  const mail = await tenantMailContext(admin, request.tenantId, {
    fallbackOrigin: request.fallbackOrigin,
  });

  return deliverEmail(admin, {
    tenantId: request.tenantId,
    personId: request.personId,
    identity: mail.identity,
    kind: EMAIL_CHANGED_KIND,
    dedupeKey: emailChangedDedupeKey(request.tokenHash),
    to: request.previousEmail,
    render: () =>
      renderEmailChanged({
        orgName: mail.displayName,
        confirmedEmail: request.confirmedEmail,
        siteUrl: mail.origin,
      }),
    logPrefix: "[email-change]",
  });
}
