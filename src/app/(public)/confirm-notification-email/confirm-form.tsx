"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { confirmNotificationEmailAction } from "./actions";

/**
 * The button is the confirmation (#1049). A link that acts on being fetched is
 * a link a mail client's scanner acts on first, which would burn the token
 * before the person ever saw the page.
 */
export function ConfirmForm({ token }: { token: string | null }) {
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "done"; email: string }
    | { status: "error"; message: string }
  >({ status: "idle" });
  const [isPending, startTransition] = useTransition();

  function confirm() {
    if (!token) return;
    startTransition(async () => {
      const result = await confirmNotificationEmailAction(token);
      setState(
        "error" in result
          ? { status: "error", message: result.error }
          : { status: "done", email: result.confirmedEmail },
      );
    });
  }

  if (!token) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          This link is incomplete. Open the one in the email, or ask for a new
          one from your account page.
        </AlertDescription>
      </Alert>
    );
  }

  if (state.status === "done") {
    return (
      <div className="space-y-4">
        <p>
          Done — portal email will now be delivered to{" "}
          <span className="font-medium">{state.email}</span>.
        </p>
        <p className="app-muted text-sm">
          You can change this at any time on your account page. How you sign in
          has not changed.
        </p>
        <Link
          href="/portal/account"
          className={buttonVariants({ variant: "outline" })}
        >
          Go to your account
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p>
        Confirm that this address should receive portal email. Nothing is sent
        here until you do.
      </p>
      <Button type="button" disabled={isPending} onClick={confirm}>
        {isPending ? (
          <>
            <Spinner /> Confirming...
          </>
        ) : (
          "Confirm this address"
        )}
      </Button>
      {state.status === "error" && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
