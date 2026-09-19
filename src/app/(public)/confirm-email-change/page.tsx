import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { ConfirmTokenForm } from "@/components/confirm-token-form";
import { MY_PATH_PREFIX } from "@/lib/constituent/paths";
import { confirmEmailChangeAction } from "./actions";

export const metadata: Metadata = {
  title: "Confirm your email address",
  // Nothing here is worth finding in a search result, and a URL carrying a
  // one-time token is worth actively keeping out of an index.
  robots: { index: false, follow: false },
};

/**
 * Where the link in a record's address-change email lands (#1164).
 *
 * Public by necessity, like #1049's: the mailbox being claimed is frequently
 * not the browser the session lives in, and possession of the token is the
 * proof being asked for. See the Server Action for the rest of that reasoning.
 *
 * Not behind `requireConstituentArea()` either. A tenant could turn the module
 * off in the day a link is alive, and a 404 on a confirmation link is a worse
 * answer than a dead-link message -- the confirmation itself is already gated,
 * because the pending address could only have been written by a member of a
 * tenant that had the area on.
 */
export default async function ConfirmEmailChangePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;

  return (
    <PageShell>
      <div className="w-fit">
        <div className="rainbow-accent w-full" />
        <h1 className="brand-display mt-4 text-4xl font-semibold tracking-brand sm:text-5xl">
          Confirm your address
        </h1>
      </div>

      <div className="mt-6 max-w-xl">
        <ConfirmTokenForm
          token={typeof token === "string" ? token : null}
          confirm={confirmEmailChangeAction}
          prompt="Confirm that this is your address. Your record keeps the old one until you do."
          buttonLabel="Confirm this address"
          backHref={MY_PATH_PREFIX}
          backLabel="Go to your account"
          doneLead="Done — we will use "
          doneTail=" from now on."
          doneNote={
            <p className="app-muted text-sm">
              How you sign in has not changed. That is set with whoever provides
              your login, not here.
            </p>
          }
        />
      </div>
    </PageShell>
  );
}
