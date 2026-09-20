"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";
import { MessagePersonDialog } from "@/components/portal/message-person-dialog";
import {
  resendArtworkSubmissionConfirmationAction,
  sendArtworkSubmissionMessageAction,
} from "./actions";

/**
 * What names the piece in the artist's own inbox (#1309).
 *
 * The call, not just "your submission": an artist may have answered several,
 * and a subject that does not say which leaves them guessing. The organization
 * comes after it, the way every other queue's default subject reads, and each
 * part drops out cleanly when it is missing rather than leaving a dangling
 * dash.
 */
export function artworkMessageSubject(
  callTitle: string,
  orgName: string,
): string {
  const what = callTitle.trim()
    ? `Your submission to ${callTitle.trim()}`
    : "Your artwork submission";
  return orgName.trim() ? `${what} — ${orgName.trim()}` : what;
}

/**
 * The two things a curator can do about this submission's correspondence: ask
 * the artist something, and send their acknowledgement again.
 *
 * A client island of its own, the same shape as the volunteer application's:
 * the sheet around it passes data, and the Server Actions are imported here
 * rather than threaded through props, so nothing crosses the boundary but
 * data.
 */
export function ArtworkSubmissionMessageActions({
  submissionId,
  artistName,
  toEmail,
  callTitle,
  orgName,
  replyTo,
  disabledReason,
}: {
  submissionId: string;
  artistName: string;
  /** Empty when there is nobody to write to; `disabledReason` then says so. */
  toEmail: string;
  /** The open call this piece answered, for the default subject. */
  callTitle: string;
  /** Blank when the tenant is unresolved; the subject drops the suffix. */
  orgName: string;
  replyTo: string | null;
  /** Set when messaging is impossible: no address, or org email switched off. */
  disabledReason?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isResending, startResend] = useTransition();

  function handleResend() {
    setError(null);
    startResend(async () => {
      await runAction(
        () => resendArtworkSubmissionConfirmationAction(submissionId),
        {
          success: "Acknowledgement resent.",
          onError: setError,
          onSuccess: () => router.refresh(),
        },
      );
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <MessagePersonDialog
          recipientName={artistName}
          toEmail={toEmail}
          actionLabel="Contact artist"
          defaultSubject={artworkMessageSubject(callTitle, orgName)}
          replyTo={replyTo}
          disabledReason={disabledReason}
          sendMessage={(input) =>
            sendArtworkSubmissionMessageAction({ ...input, submissionId })
          }
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleResend}
          disabled={isResending || !!disabledReason}
        >
          {isResending ? <Spinner className="size-4" /> : null}
          Resend acknowledgement
        </Button>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
