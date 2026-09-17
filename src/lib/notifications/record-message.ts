import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrgEmailEnabled } from "@/lib/notifications/settings";
import {
  MAX_MESSAGE_BODY_LENGTH,
  MAX_MESSAGE_SUBJECT_LENGTH,
} from "@/lib/outbound-messages";

/**
 * What every "message the person this record is about" action has to say,
 * whatever the record is (#1204).
 *
 * #1203 wrote these once, in the gear request's action, because there was one
 * caller. There are now three, and a composer that refuses a message for a
 * reason worded differently on each queue would be three features rather than
 * one. What stays with each module is the wording that names the record --
 * "This request could not be found" against "This application could not be
 * found" -- because that sentence is the only part a reader can act on.
 */
export const RECORD_MESSAGE_ERRORS = {
  SUBJECT_REQUIRED: "Write a subject.",
  BODY_REQUIRED: "Write a message.",
  SUBJECT_TOO_LONG: `Keep the subject to ${MAX_MESSAGE_SUBJECT_LENGTH} characters or fewer.`,
  BODY_TOO_LONG: `Keep the message to ${MAX_MESSAGE_BODY_LENGTH} characters or fewer.`,
  MESSAGE_ID_INVALID: "Reopen the message and try again.",
  ALREADY_SENT:
    "That message has already gone out. Reopen the composer to send another.",
  EMAIL_OFF:
    "Outbound email is switched off for this organization, so nothing was sent.",
  FAILED: "The message could not be sent. Please try again.",
} as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Everything that can be judged before the record is read: the id the composer
 * minted, and what was typed into it.
 *
 * The id is checked rather than trusted because it becomes the dedupe key and
 * the primary key of the history row -- a client sending the same id twice is
 * the case the whole idempotency design exists for, and one sending something
 * that is not a uuid at all should be told to reopen the dialog, not handed a
 * database error.
 */
export function validateRecordMessage(input: {
  messageId: string;
  subject: string;
  body: string;
}): { error: string } | { subject: string; body: string } {
  if (!UUID_PATTERN.test(input.messageId)) {
    return { error: RECORD_MESSAGE_ERRORS.MESSAGE_ID_INVALID };
  }
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!subject) return { error: RECORD_MESSAGE_ERRORS.SUBJECT_REQUIRED };
  if (!body) return { error: RECORD_MESSAGE_ERRORS.BODY_REQUIRED };
  if (subject.length > MAX_MESSAGE_SUBJECT_LENGTH) {
    return { error: RECORD_MESSAGE_ERRORS.SUBJECT_TOO_LONG };
  }
  if (body.length > MAX_MESSAGE_BODY_LENGTH) {
    return { error: RECORD_MESSAGE_ERRORS.BODY_TOO_LONG };
  }
  return { subject, body };
}

/**
 * Why a send was skipped, in the staffer's terms.
 *
 * sendStaffMessage() answers `skipped` for two situations that are not the
 * same news -- the organization's switch is off, or this message id has
 * already been spent -- and only the settings can tell them apart. Read under
 * the caller's own session, which is what `org_notification_settings` is
 * scoped to.
 */
export async function explainSkippedSend(
  supabase: SupabaseClient,
  alreadySent: string = RECORD_MESSAGE_ERRORS.ALREADY_SENT,
): Promise<string> {
  return (await getOrgEmailEnabled(supabase))
    ? alreadySent
    : RECORD_MESSAGE_ERRORS.EMAIL_OFF;
}
