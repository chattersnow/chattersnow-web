"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";
import { askToAcknowledgeAsIsAction } from "../actions";

/**
 * Email this requester their own link to acknowledge as-is (#1518). Off, with
 * the reason beside it, when there is no address or org email is switched
 * off -- #1502's shape.
 */
export function AskAsIsButton({
  requestId,
  asked,
  disabledReason,
}: {
  requestId: string;
  /** A link has been sent already: the button sends a fresh one. */
  asked: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      await runAction(() => askToAcknowledgeAsIsAction(requestId), {
        success: "Sent. The requester has their own link for 30 days.",
        onError: setError,
        onSuccess: () => router.refresh(),
      });
    });
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="w-fit"
        onClick={handleClick}
        disabled={isPending || Boolean(disabledReason)}
      >
        {isPending ? <Spinner className="size-4" /> : null}
        {asked ? "Ask again to acknowledge as-is" : "Ask to acknowledge as-is"}
      </Button>
      {disabledReason ? (
        <p className="app-muted text-xs">{disabledReason}</p>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
