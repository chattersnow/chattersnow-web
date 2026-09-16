import { ConfirmTokenForm } from "@/components/confirm-token-form";
import { confirmNotificationEmailAction } from "./actions";

/**
 * #1049's confirmation, on the form both confirmations share (#1164). A server
 * component now: the only thing left here is this route's copy and its Server
 * Action, and the interactive half lives in ConfirmTokenForm.
 */
export function ConfirmForm({ token }: { token: string | null }) {
  return (
    <ConfirmTokenForm
      token={token}
      confirm={confirmNotificationEmailAction}
      prompt="Confirm that this address should receive portal email. Nothing is sent here until you do."
      buttonLabel="Confirm this address"
      backHref="/portal/account"
      backLabel="Go to your account"
      doneLead="Done — portal email will now be delivered to "
      doneTail="."
      doneNote={
        <p className="app-muted text-sm">
          You can change this at any time on your account page. How you sign in
          has not changed.
        </p>
      }
    />
  );
}
