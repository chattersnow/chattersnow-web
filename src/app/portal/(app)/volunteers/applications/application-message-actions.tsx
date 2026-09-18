"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";
import { MessagePersonDialog } from "@/components/portal/message-person-dialog";
import {
  resendVolunteerApplicationConfirmationAction,
  sendVolunteerApplicationMessageAction,
} from "./actions";

/**
 * The two things a reviewer can do about this application's correspondence
 * (#1204): ask the applicant something, and send their confirmation again.
 *
 * A client island of its own, the same shape as the gear request's: the sheet
 * around it passes data, and the Server Actions are imported here rather than
 * threaded through props, so nothing crosses the boundary but data.
 */
export function VolunteerApplicationMessageActions({
  applicationId,
  applicantName,
  toEmail,
  orgName,
  replyTo,
  disabledReason,
}: {
  applicationId: string;
  applicantName: string;
  /** Empty when there is nobody to write to; `disabledReason` then says so. */
  toEmail: string;
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
        () => resendVolunteerApplicationConfirmationAction(applicationId),
        {
          success: "Confirmation resent.",
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
          recipientName={applicantName}
          toEmail={toEmail}
          actionLabel="Message applicant"
          defaultSubject={
            orgName
              ? `Your volunteer application — ${orgName}`
              : "Your volunteer application"
          }
          replyTo={replyTo}
          disabledReason={disabledReason}
          sendMessage={(input) =>
            sendVolunteerApplicationMessageAction({ ...input, applicationId })
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
          Resend confirmation
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
