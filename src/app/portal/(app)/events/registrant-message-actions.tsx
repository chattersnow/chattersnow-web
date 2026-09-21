"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";
import { MessagePersonDialog } from "@/components/portal/message-person-dialog";
import {
  resendEventRegistrationConfirmationAction,
  sendEventRegistrantMessageAction,
} from "./registrants-actions";
import { registrantMessageSubject } from "./registrant-messaging";

/**
 * The two things an organizer can do about one registration's correspondence:
 * write to the person, and send their confirmation again (#1317).
 *
 * A client island of its own, the same shape as the artwork submission's and
 * the volunteer application's: the sheet around it passes data, and the Server
 * Actions are imported here rather than threaded through props, so nothing
 * crosses the boundary but data.
 */
export function RegistrantMessageActions({
  registrationId,
  registrantName,
  toEmail,
  eventName,
  orgName,
  replyTo,
  disabledReason,
  onSent,
}: {
  registrationId: string;
  registrantName: string;
  /** Empty when there is nobody to write to; `disabledReason` then says so. */
  toEmail: string;
  /** The event this registration is for, for the default subject. */
  eventName: string;
  /** Blank when the tenant is unresolved; the subject drops the suffix. */
  orgName: string;
  replyTo: string | null;
  /** Set when messaging is impossible: no address, or org email switched off. */
  disabledReason?: string;
  /** Reloads the tab's own copy of the list, which carries the history. */
  onSent?: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isResending, startResend] = useTransition();

  function refresh() {
    onSent?.();
    router.refresh();
  }

  function handleResend() {
    setError(null);
    startResend(async () => {
      await runAction(
        () => resendEventRegistrationConfirmationAction(registrationId),
        {
          success: "Confirmation resent.",
          onError: setError,
          onSuccess: refresh,
        },
      );
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <MessagePersonDialog
          recipientName={registrantName}
          toEmail={toEmail}
          actionLabel="Contact registrant"
          defaultSubject={registrantMessageSubject(eventName, orgName)}
          replyTo={replyTo}
          disabledReason={disabledReason}
          sendMessage={async (input) => {
            const result = await sendEventRegistrantMessageAction({
              ...input,
              registrationId,
            });
            if ("success" in result) refresh();
            return result;
          }}
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
