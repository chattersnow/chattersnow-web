"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getRequestOrigin } from "@/lib/request-origin";
import { sendStaffMessage } from "@/lib/notifications/staff-message";
import {
  explainSkippedSend,
  RECORD_MESSAGE_ERRORS,
  validateRecordMessage,
} from "@/lib/notifications/record-message";
import { CONTACT_MESSAGE_RECORD_TYPE } from "@/lib/outbound-messages";
import {
  CONTACT_MESSAGE_STATUSES,
  type ContactMessageStatus,
} from "./message-types";

const COMMUNICATIONS_PATH = "/portal/communications";

export type ContactMessageActionResult = { error: string } | { success: true };

export async function updateContactMessageStatusAction(
  id: string,
  status: ContactMessageStatus,
): Promise<ContactMessageActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update a message.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "communications",
    "manage",
  );
  if (permissionError) return permissionError;

  if (!(CONTACT_MESSAGE_STATUSES as readonly string[]).includes(status)) {
    return { error: "Not a valid status." };
  }

  const { error } = await supabase
    .from("contact_messages")
    .update({ status })
    .eq("id", id);

  if (error) {
    return { error: "Could not update this message. Please try again." };
  }

  revalidatePath(COMMUNICATIONS_PATH);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Replying from the portal (#1204, on #1203's primitive)
// ---------------------------------------------------------------------------

// What names this record, said this queue's way; the rest of what a composer
// can answer is shared (@/lib/notifications/record-message).
const REPLY_ERRORS = {
  SIGNED_OUT: "You must be signed in to reply to a message.",
  NOT_FOUND: "This message could not be found.",
  NO_EMAIL:
    "This message has no email address to reply to — it was cleared by the retention rules.",
  FAILED: RECORD_MESSAGE_ERRORS.FAILED,
} as const;

type ContactMessageRow = {
  id: string;
  tenant_id: string;
  name: string | null;
  email: string | null;
};

/**
 * Answer somebody who wrote in through the public contact form.
 *
 * Until now the reply left the platform entirely: the message sat in this
 * queue marked handled with nothing to show for it, and the next person to
 * open it could not tell whether it had been answered or by whom.
 *
 * The one case #1203's nullable `person_id` was built for. `contact_messages`
 * carries an address and no `people` row, and nothing here resolves one:
 * somebody who wrote in once is not a constituent, and creating a directory
 * entry for every enquiry would fill the directory with people the
 * organization has no relationship with. The history row keys on the address
 * instead.
 *
 * Nothing of the original message is quoted back. The writer has their own
 * copy, and putting their words through our sender buys nothing — the subject
 * names the topic they chose, which is enough to place it.
 */
export async function sendContactMessageReplyAction(input: {
  messageId: string;
  contactMessageId: string;
  subject: string;
  body: string;
}): Promise<ContactMessageActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(supabase, REPLY_ERRORS.SIGNED_OUT);
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "communications",
    "manage",
  );
  if (permissionError) return permissionError;

  const validated = validateRecordMessage(input);
  if ("error" in validated) return validated;
  const { subject, body } = validated;

  // Read under the caller's own session, so a message in another tenant is
  // not found rather than being mailed.
  const { data, error } = await supabase
    .from("contact_messages")
    .select("id, tenant_id, name, email")
    .eq("id", input.contactMessageId)
    .maybeSingle<ContactMessageRow>();

  if (error) return { error: REPLY_ERRORS.FAILED };
  if (!data) return { error: REPLY_ERRORS.NOT_FOUND };
  const toEmail = data.email?.trim();
  if (!toEmail) return { error: REPLY_ERRORS.NO_EMAIL };

  const outcome = await sendStaffMessage(createSupabaseAdminClient(), {
    messageId: input.messageId,
    tenantId: data.tenant_id,
    personId: null,
    toEmail,
    recipientName: (data.name ?? "").trim(),
    module: "communications",
    recordType: CONTACT_MESSAGE_RECORD_TYPE,
    recordId: input.contactMessageId,
    subject,
    body,
    sentBy: userResult.user.id,
    fallbackOrigin: await getRequestOrigin(),
  });

  if (outcome === "skipped") {
    return { error: await explainSkippedSend(supabase) };
  }
  if (outcome === "failed") return { error: REPLY_ERRORS.FAILED };

  // Deliberately not a status change. A reply that asks a question is not the
  // same as the matter being handled, and moving the message to resolved on
  // the reviewer's behalf would make the queue lie about its own state.
  revalidatePath(COMMUNICATIONS_PATH);
  return { success: true };
}
