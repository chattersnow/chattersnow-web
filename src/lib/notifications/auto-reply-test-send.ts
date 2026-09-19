import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TenantMailContext } from "@/lib/email/identity";
import type { AutoReplyCopy } from "@/lib/notifications/auto-replies";
import { renderAutoReplyPreview } from "@/lib/notifications/auto-reply-preview";
import {
  deliverEmail,
  type DeliveryOutcome,
} from "@/lib/notifications/deliver";
import type { RenderedEmail } from "@/lib/notifications/rendered-email";
import { isOrgEmailEnabled } from "@/lib/notifications/settings";

/**
 * Mail one of a tenant's automatic replies to the administrator writing it
 * (#1236).
 *
 * The inline preview answers "what does it say?"; this answers "what does it
 * look like in a real inbox?" -- which is a different question, because an
 * email client is the thing that decides whether the images load, whether the
 * widths hold and whether it lands in spam at all. Neither replaces the other.
 *
 * Two rules this file exists to hold:
 *
 *   * **The recipient is never an argument from the client.** The action
 *     resolves it from the caller's own directory record, and it arrives here
 *     already resolved. A form that mailed typed-in text to a typed-in address
 *     would be an open relay sitting behind `system_settings:manage`.
 *   * **A test must never suppress a real receipt.** It claims the ledger
 *     under its own kind, not the reply's, so its dedupe key cannot collide
 *     with the row a genuine confirmation claims -- and the key carries a
 *     timestamp besides, so a second test after an edit always goes.
 */

/**
 * The ledger kind a test send claims under.
 *
 * Deliberately not a NOTIFICATION_KINDS entry: there is no switch anybody
 * should hold for it, and registering one would grow a preference on
 * /portal/account that could never change what they receive. The practical
 * consequence is that `hasOptedOut()` never suppresses a test -- which is
 * right, since the person receiving it is the person who pressed the button.
 */
export const AUTO_REPLY_TEST_KIND = "auto_reply_test";

/** What the banner says, in both parts. */
export const AUTO_REPLY_TEST_NOTE =
  "This is a test of one of your organization's automatic replies. Nobody else was sent it, and every detail in it is made up.";

/** The subject prefix, so a test is never mistaken for the real thing. */
export const AUTO_REPLY_TEST_SUBJECT_PREFIX = "[Test] ";

/**
 * A key no real receipt can collide with: the kind, the moment, and a uuid.
 *
 * The timestamp is what makes a second test after an edit arrive rather than
 * losing the unique-constraint race with the first, and it is readable in the
 * ledger, which is the reason it is there rather than a bare uuid. The uuid is
 * what makes two tests in the same millisecond still both send.
 */
export function autoReplyTestDedupeKey(kind: string, now = new Date()): string {
  return `${kind}:${now.toISOString()}:${randomUUID()}`;
}

/**
 * The same email, marked as a test in both parts and in the subject.
 *
 * The banner is prepended as its own block rather than woven into the body,
 * because the body is the thing under review: an administrator checking their
 * own wording should be able to read past the banner and see exactly the
 * email a member of the public would get.
 */
export function markAsTest(rendered: RenderedEmail): RenderedEmail {
  return {
    ...rendered,
    subject: `${AUTO_REPLY_TEST_SUBJECT_PREFIX}${rendered.subject}`,
    text: `${AUTO_REPLY_TEST_NOTE}\n\n${rendered.text}`,
    html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #57534e; font-size: 13px; line-height: 1.5; max-width: 560px; margin: 0 0 16px; padding: 8px 12px; border-left: 3px solid #d6d3d1;">${AUTO_REPLY_TEST_NOTE}</div>
${rendered.html}`,
  };
}

export type AutoReplyTestRequest = {
  tenantId: string;
  /** The caller's own people row. Resolved by the action, never sent by it. */
  personId: string;
  /** Their `notification_email` override or sign-in address (#1042). */
  toEmail: string;
  /** Which automatic reply is being tested. */
  kind: string;
  /** The draft slots folded over the platform's defaults. */
  copy: AutoReplyCopy;
  /** The tenant's sender identity and origin, already resolved. */
  mail: TenantMailContext;
  timeZone: string;
};

export type AutoReplyTestOutcome = DeliveryOutcome | "no-sample";

/**
 * Send it, or say why not.
 *
 * `skipped` means the organization's kill switch is off -- `isOrgEmailEnabled`
 * fails closed on an unreadable switch, and this respects that rather than
 * making an exception for a message the sender asked for: a switched-off
 * organization should not be able to send itself mail through a provider whose
 * daily quota it shares with everything else.
 */
export async function sendAutoReplyTest(
  admin: SupabaseClient,
  request: AutoReplyTestRequest,
): Promise<AutoReplyTestOutcome> {
  if (!(await isOrgEmailEnabled(admin, request.tenantId))) return "skipped";

  const rendered = renderAutoReplyPreview(request.kind, request.copy, {
    orgName: request.mail.displayName,
    siteUrl: request.mail.origin,
    timeZone: request.timeZone,
  });
  if (!rendered) return "no-sample";

  return deliverEmail(admin, {
    tenantId: request.tenantId,
    personId: request.personId,
    identity: request.mail.identity,
    kind: AUTO_REPLY_TEST_KIND,
    dedupeKey: autoReplyTestDedupeKey(request.kind),
    to: request.toEmail,
    render: () => markAsTest(rendered),
    logPrefix: "[auto-reply-test]",
  });
}
