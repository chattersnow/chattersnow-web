import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tenantMailContext } from "@/lib/email/identity";
import {
  deliverEmail,
  type DeliveryOutcome,
} from "@/lib/notifications/deliver";
import { isOrgEmailEnabled } from "@/lib/notifications/settings";
import {
  renderNotificationEmailChanged,
  renderNotificationEmailConfirmation,
} from "@/lib/notifications/notification-email-emails";

/**
 * The two sends behind address verification (#1049).
 *
 * Both go through deliverEmail() like every other sender, so they are claimed
 * in notification_deliveries before they are sent and a retried Server Action
 * resolves on the unique constraint rather than mailing twice. Neither kind
 * appears in NOTIFICATION_KINDS, for the reason the ops report does not: these
 * are not things to opt into. A switch on /portal/account offering to turn off
 * the message that proves you hold an address, or the one that tells you your
 * mail has been redirected, would be a setting whose only use is to hide a
 * change from the person it happened to.
 *
 * The org-wide kill switch does still govern them, which is the one rule worth
 * keeping absolute: when an organization has email turned off, nothing leaves
 * this application. A pending address in a tenant with email off simply stays
 * pending, which is the truthful outcome -- with nothing being sent, an
 * override has nothing to redirect.
 */

/**
 * What both setters answer, and what the two Server Actions branch on.
 *
 * 'cleared' and 'unchanged' are finished when the RPC returns: nothing is sent,
 * because both land on an address somebody has already proved they hold.
 * 'pending' is the only outcome with a message behind it.
 */
export type NotificationEmailOutcome = "cleared" | "unchanged" | "pending";

/**
 * What both Server Actions hand back. The outcome rides along because the two
 * surfaces say something different for each: "waiting on a link sent to X"
 * reads as a failure if it is reported as a plain save.
 */
export type NotificationEmailResult =
  | { error: string }
  | {
      success: true;
      outcome: NotificationEmailOutcome;
      pendingEmail: string | null;
    };

/** One row of set_my_notification_email / set_notification_email_for_person. */
export type SetNotificationEmailRow = {
  outcome: NotificationEmailOutcome;
  person_id: string;
  tenant_id: string;
  display_name: string | null;
  pending_email: string | null;
  expires_at: string | null;
};

export const NOTIFICATION_EMAIL_CONFIRMATION_KIND =
  "notification_email_confirmation";

export const NOTIFICATION_EMAIL_CHANGED_KIND = "notification_email_changed";

/**
 * Keyed on the token's hash rather than the address: a resend mints a new
 * token, and should reach the mailbox again, while two clicks on one link
 * should not.
 */
export function confirmationDedupeKey(tokenHash: string): string {
  return `notification-email-confirm:${tokenHash}`;
}

export function changedDedupeKey(tokenHash: string): string {
  return `notification-email-changed:${tokenHash}`;
}

export async function sendNotificationEmailConfirmation(
  admin: SupabaseClient,
  request: {
    tenantId: string;
    personId: string;
    personName: string | null;
    pendingEmail: string;
    /** The raw token. It is not stored anywhere; this is its only use. */
    token: string;
    tokenHash: string;
    expiresAt: Date;
    fallbackOrigin: string;
  },
): Promise<DeliveryOutcome> {
  if (!(await isOrgEmailEnabled(admin, request.tenantId))) return "skipped";

  const mail = await tenantMailContext(admin, request.tenantId, {
    fallbackOrigin: request.fallbackOrigin,
  });

  return deliverEmail(admin, {
    tenantId: request.tenantId,
    personId: request.personId,
    identity: mail.identity,
    kind: NOTIFICATION_EMAIL_CONFIRMATION_KIND,
    dedupeKey: confirmationDedupeKey(request.tokenHash),
    to: request.pendingEmail,
    render: () =>
      renderNotificationEmailConfirmation({
        orgName: mail.displayName,
        personName: request.personName,
        token: request.token,
        expiresAt: request.expiresAt,
        siteUrl: mail.origin,
      }),
    logPrefix: "[notification-email]",
  });
}

export async function sendNotificationEmailChanged(
  admin: SupabaseClient,
  request: {
    tenantId: string;
    personId: string;
    /** Where mail was going until the confirmation landed. */
    previousEmail: string;
    confirmedEmail: string;
    tokenHash: string;
    fallbackOrigin: string;
  },
): Promise<DeliveryOutcome> {
  // Nothing to tell: the address that was in use is the one just confirmed, or
  // there was no address at all.
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
    kind: NOTIFICATION_EMAIL_CHANGED_KIND,
    dedupeKey: changedDedupeKey(request.tokenHash),
    to: request.previousEmail,
    render: () =>
      renderNotificationEmailChanged({
        orgName: mail.displayName,
        confirmedEmail: request.confirmedEmail,
        siteUrl: mail.origin,
      }),
    logPrefix: "[notification-email]",
  });
}
