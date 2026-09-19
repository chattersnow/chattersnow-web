"use server";

import {
  autoReplyDefinition,
  mergeAutoReplySlots,
  validateAutoReplySlots,
} from "@/lib/notifications/auto-replies";
import { sendAutoReplyTest } from "@/lib/notifications/auto-reply-test-send";
import { getClientIp } from "@/lib/get-client-ip";
import { AUTO_REPLY_MAIL_ERRORS, resolveAutoReplyCaller } from "./mail-context";

/**
 * Mail the reply being edited to the person editing it (#1236).
 *
 * The recipient is not a parameter and cannot be made one: it is resolved from
 * the caller's own directory record inside `resolveAutoReplyCaller()`. The
 * only things this action accepts are which reply to send and what it should
 * say -- and the second of those is already what the Save button writes, so a
 * hand-made request can send itself its own words and nothing more.
 */

export type AutoReplyTestResult =
  { error: string } | { sentTo: string; logged: boolean };

/** Five in a quarter hour. Resend's free plan allows 100 a day for the tenant. */
const TEST_SEND_LIMIT = 5;
const TEST_SEND_WINDOW = "15 minutes";

/**
 * Not exported: a `"use server"` module may export nothing but async
 * functions, and a constant object here is a 500 on the page that imports it
 * (Next's "A \"use server\" file can only export async functions").
 */
const TEST_SEND_ERRORS = {
  UNKNOWN_KIND: "That automatic reply does not exist.",
  RATE_LIMITED:
    "That is several tests in a few minutes. Wait a quarter of an hour and try again — the organization shares one daily sending allowance.",
  EMAIL_OFF:
    "Outbound email is switched off for this organization, so nothing was sent. Turn it back on under Organization Settings → Notifications.",
  NO_SAMPLE: "This reply has no sample to send yet.",
  FAILED:
    "The test could not be sent. The sending address may not be configured yet.",
} as const;

export async function sendAutoReplyTestAction(
  kind: string,
  slots: Record<string, string>,
): Promise<AutoReplyTestResult> {
  const resolved = await resolveAutoReplyCaller();
  if ("error" in resolved) return resolved;
  const { caller } = resolved;

  const definition = autoReplyDefinition(kind);
  if (!definition) return { error: TEST_SEND_ERRORS.UNKNOWN_KIND };
  if (!caller.toEmail) return { error: AUTO_REPLY_MAIL_ERRORS.NO_ADDRESS };

  // The same check the Save button makes. A test is the last look before the
  // wording goes live, and sending one built from copy that will not save
  // would show an administrator an email they cannot actually have.
  const problems = validateAutoReplySlots(definition, slots);
  if (problems.length > 0) {
    return { error: problems.map((problem) => problem.message).join(" ") };
  }

  // Per user *and* per address: the route carries the caller's id, so two
  // administrators in one office do not share a bucket, while the window is
  // still counted per IP the way every other limited path is. An absent IP --
  // local development with no forwarded-for header -- makes check_rate_limit
  // fail open, which is its documented behaviour and is acceptable here: the
  // gate that matters for the sending quota is RESEND_API_KEY, and it is unset
  // in exactly those environments.
  const { data: allowed, error: limitError } = await caller.admin.rpc(
    "check_rate_limit",
    {
      p_route: `auto_reply_test_send:${caller.userId}`,
      p_ip_address: await getClientIp(),
      p_max_attempts: TEST_SEND_LIMIT,
      p_window: TEST_SEND_WINDOW,
    },
  );
  if (!limitError && allowed === false) {
    return { error: TEST_SEND_ERRORS.RATE_LIMITED };
  }

  const outcome = await sendAutoReplyTest(caller.admin, {
    tenantId: caller.tenantId,
    personId: caller.personId,
    toEmail: caller.toEmail,
    kind,
    copy: mergeAutoReplySlots(definition, slots),
    mail: caller.mail,
    timeZone: caller.timeZone,
  });

  if (outcome === "no-sample") return { error: TEST_SEND_ERRORS.NO_SAMPLE };
  // The only thing that skips a test send is the org-wide kill switch: the
  // dedupe key is unique per press, so the ledger race the other senders can
  // lose is not reachable from here.
  if (outcome === "skipped") return { error: TEST_SEND_ERRORS.EMAIL_OFF };
  if (outcome === "failed") return { error: TEST_SEND_ERRORS.FAILED };

  // Reported rather than glossed over: with no provider key the whole path
  // still runs and sendEmail() logs instead of sending, and a button that said
  // "sent" there would be lying to every developer and preview deploy.
  return {
    sentTo: caller.toEmail,
    logged: !process.env.RESEND_API_KEY,
  };
}
