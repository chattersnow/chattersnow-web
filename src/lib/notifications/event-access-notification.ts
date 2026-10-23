import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tenantMailContext } from "@/lib/email/identity";
import {
  deliverEmail,
  type DeliveryOutcome,
} from "@/lib/notifications/deliver";
import { isOrgEmailEnabled } from "@/lib/notifications/settings";
import { renderEventAccessEmail } from "@/lib/notifications/event-access-email";

/**
 * Tells a guest they were given access to an event (#1689). Through
 * deliverEmail() like every sender, so a retried action mails once, and under
 * the org-wide switch: with email off nothing leaves, and the administrator
 * passes the access on themselves.
 */

export const EVENT_ACCESS_GRANTED_KIND = "event_access_granted";

export type EventAccessNotice = {
  tenantId: string;
  /** The grant's or the invite's id: one email per grant made. */
  grantId: string;
  to: string;
  eventName: string;
  level: "view" | "manage";
  areaLabels: readonly string[];
  grantedBy: string | null;
  /**
   * The invite's sign-in link, absolute; null for an existing account, which
   * gets a link to the event instead.
   */
  inviteLink: string | null;
  /** Path of the event in the portal, e.g. `/portal/events/<id>`. */
  eventPath: string;
  fallbackOrigin: string;
};

export async function sendEventAccessNotice(
  admin: SupabaseClient,
  notice: EventAccessNotice,
): Promise<DeliveryOutcome> {
  if (!(await isOrgEmailEnabled(admin, notice.tenantId))) return "skipped";

  const mail = await tenantMailContext(admin, notice.tenantId, {
    fallbackOrigin: notice.fallbackOrigin,
  });
  const origin = mail.origin.replace(/\/+$/, "");

  return deliverEmail(admin, {
    tenantId: notice.tenantId,
    personId: null,
    identity: mail.identity,
    kind: EVENT_ACCESS_GRANTED_KIND,
    dedupeKey: `${EVENT_ACCESS_GRANTED_KIND}:${notice.grantId}`,
    to: notice.to,
    render: () =>
      renderEventAccessEmail({
        orgName: mail.displayName,
        eventName: notice.eventName,
        level: notice.level,
        areaLabels: notice.areaLabels,
        grantedBy: notice.grantedBy,
        url: notice.inviteLink ?? `${origin}${notice.eventPath}`,
        invite: notice.inviteLink !== null,
        siteUrl: mail.origin,
        branding: mail.branding,
      }),
    logPrefix: "[event-access]",
  });
}
