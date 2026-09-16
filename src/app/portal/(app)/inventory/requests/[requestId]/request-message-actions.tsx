"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";
import { MessagePersonDialog } from "@/components/portal/message-person-dialog";
import {
  resendGearRequestConfirmationAction,
  sendGearRequestMessageAction,
} from "../actions";

/**
 * The two things a manager can do about this request's correspondence.
 *
 * A client island of its own, the same shape as `request-status-actions.tsx`:
 * the card around it stays a server component that only reads and renders, and
 * the Server Actions are imported here rather than threaded through props, so
 * nothing is passed across the RSC boundary but data.
 */
export function GearRequestMessageActions({
  requestId,
  recipientName,
  toEmail,
  orgName,
  replyTo,
  disabledReason,
}: {
  requestId: string;
  recipientName: string;
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
      await runAction(() => resendGearRequestConfirmationAction(requestId), {
        success: "Confirmation resent.",
        onError: setError,
        onSuccess: () => router.refresh(),
      });
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <MessagePersonDialog
          recipientName={recipientName}
          toEmail={toEmail}
          defaultSubject={
            orgName ? `Your gear request — ${orgName}` : "Your gear request"
          }
          replyTo={replyTo}
          disabledReason={disabledReason}
          sendMessage={(input) =>
            sendGearRequestMessageAction({ ...input, requestId })
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
