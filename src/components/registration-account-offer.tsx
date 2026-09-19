"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { claimFromRegistrationAction } from "@/app/(public)/my/claim-actions";
import { myRegistrationSignInPath } from "@/lib/constituent/paths";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";

/** What the reader is offered once their registration is saved (#1258). */
export type AccountOffer = "sign-up" | "claim";

/**
 * The one sentence this is allowed to promise, in either state.
 *
 * It does not promise history, and it never says "we found you": the offer
 * reads identically whether the registration matched a directory record,
 * matched nobody, or the account already had a claim open, because anything
 * that varied would answer "do you have a record of this person?" for anybody
 * who can make an account (§5.23).
 */
const PROMISE =
  "You'll be able to see this on your account once we've confirmed who you are.";

/** The same confirmation for every outcome, for the same reason. */
const SENT = "Thanks — someone will check this. Nothing else for you to do.";

/**
 * Keeping a registration: the offer in the post-registration slot (#1258).
 *
 * It is never a gate. The registration was saved before this rendered, the
 * confirmation email is already on its way, and skipping is one click that
 * changes nothing -- which is also why the failure messages below are quiet:
 * there is nothing here for a reader to fix.
 *
 * Two states, decided on the server, because only the server can see the
 * module and the session:
 *
 *   * `sign-up` -- signed out. A link to `/my/sign-in` carrying this
 *     registration, so that whatever the account costs (a password, a Google
 *     round trip, an email confirmation opened tomorrow) the claim is still
 *     waiting on the other side.
 *   * `claim` -- signed in with no record linked yet. One button, nothing to
 *     retype: the registration row already holds what they typed.
 *
 * A reader whose account is already linked is offered nothing at all, and does
 * not reach this component -- it is already on their record.
 */
export function RegistrationAccountOffer({
  offer,
  registrationId,
  /** Where "No thanks" goes. Absent, it simply dismisses the offer. */
  skipHref,
  /**
   * The level its heading takes, so it does not skip one. It sits under the
   * event sheet's `h2` and under this page's `h1`, and a fixed `h3` is wrong
   * in one of those two places whichever one it is fixed at.
   */
  headingLevel = "h3",
}: {
  offer: AccountOffer;
  registrationId: string;
  skipHref?: string;
  headingLevel?: "h2" | "h3";
}) {
  const Heading = headingLevel;
  const [sent, setSent] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClaim() {
    setError(null);
    startTransition(async () => {
      const result = await claimFromRegistrationAction(registrationId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSent(true);
    });
  }

  if (skipped) return null;

  if (sent) {
    return (
      <Alert>
        <AlertDescription>{SENT}</AlertDescription>
      </Alert>
    );
  }

  // No outer margin: this renders inside a confirmation panel on the event and
  // inside a card on `/my/registration/[registrationId]`, and only the caller
  // knows what it is sitting next to.
  return (
    <div className="space-y-3">
      <div>
        <Heading className="font-heading text-lg">Keep this</Heading>
        <p className="app-muted text-sm leading-relaxed">
          {offer === "sign-up"
            ? `Make an account and we'll add this registration to it. ${PROMISE}`
            : `Add this registration to your account. ${PROMISE}`}
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {offer === "sign-up" ? (
          // A link wearing the button's clothes, rather than a `Button` with a
          // link inside it: this navigates, so it keeps link semantics -- open
          // in a new tab, copy the address, and the role a screen reader
          // announces. `buttonVariants` is the same appearance either way.
          <Link
            href={myRegistrationSignInPath(registrationId)}
            className={buttonVariants({ variant: "rainbow" })}
          >
            Make an account
          </Link>
        ) : (
          <Button variant="rainbow" onClick={handleClaim} disabled={isPending}>
            {isPending ? "Sending..." : "Add to my account"}
          </Button>
        )}

        {skipHref ? (
          <Link
            href={skipHref}
            className={buttonVariants({ variant: "ghost" })}
          >
            No thanks
          </Link>
        ) : (
          <Button variant="ghost" onClick={() => setSkipped(true)}>
            No thanks
          </Button>
        )}
      </div>
    </div>
  );
}
