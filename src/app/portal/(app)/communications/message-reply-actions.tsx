"use client";

import { MessagePersonDialog } from "@/components/portal/message-person-dialog";
import { sendContactMessageReplyAction } from "./actions";

/**
 * Reply to somebody who wrote in (#1204).
 *
 * One action rather than the two the other queues have: a contact message has
 * no receipt of its own to resend — the sender got a staff notice (#742), and
 * the writer got nothing to lose.
 */
export function ContactMessageReplyActions({
  contactMessageId,
  senderName,
  toEmail,
  topicLabel,
  replyTo,
  disabledReason,
}: {
  contactMessageId: string;
  senderName: string;
  /** Empty when there is nobody to reply to; `disabledReason` then says so. */
  toEmail: string;
  /** What the writer chose on the form, already run through the lexicon. */
  topicLabel: string;
  replyTo: string | null;
  /** Set when replying is impossible: no address, or org email switched off. */
  disabledReason?: string;
}) {
  return (
    // Wrapped so the trigger sizes to its label: the sheet lays its section
    // out as a column, and a bare button would stretch the width of it.
    <div className="flex flex-wrap items-center gap-2">
      <MessagePersonDialog
        recipientName={senderName}
        toEmail={toEmail}
        actionLabel="Reply"
        defaultSubject={`Re: ${topicLabel}`}
        replyTo={replyTo}
        disabledReason={disabledReason}
        sendMessage={(input) =>
          sendContactMessageReplyAction({ ...input, contactMessageId })
        }
      />
    </div>
  );
}
