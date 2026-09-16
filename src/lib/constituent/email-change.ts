// Changing the address on your own record (#1164), with no Next in it -- the
// #1082 Phase 1 shape, and a near-twin of notification-email-core.ts.
//
// The two are deliberately not one module. They mint the same kind of token
// and defer the same kind of send, and that machinery is shared below through
// `mintConfirmationToken` and `deliverEmail`; what differs is the column being
// moved and what moving it means. `notification_email` redirects mail;
// `people.email` is the key #1162's claim weighed and every duplicate check
// matches on, which is why this path has a `taken` outcome the other has no
// use for and why the messages it sends say something different.
import type { SupabaseClient } from "@supabase/supabase-js";
import { isEmailAddress } from "@/lib/email/identity";
import { actionError, type ActionFailure } from "@/lib/portal/action-result";
import { mintConfirmationToken } from "@/lib/notifications/notification-email-token";
import type { NotificationEmailContext } from "@/lib/notifications/notification-email-core";

/**
 * What `request_my_email_change()` answers.
 *
 * 'unchanged' and 'taken' are finished when the RPC returns: neither leaves a
 * pending address, so there is nothing to send and nothing to confirm.
 * 'pending' is the only outcome with a message behind it.
 */
export type EmailChangeOutcome = "unchanged" | "taken" | "pending";

export type EmailChangeResult =
  | ActionFailure
  | {
      success: true;
      outcome: EmailChangeOutcome;
      pendingEmail: string | null;
      expiresAt: string | null;
    };

/** One row of `request_my_email_change()`. */
type RequestEmailChangeRow = {
  outcome: EmailChangeOutcome;
  person_id: string;
  tenant_id: string;
  display_name: string | null;
  pending_email: string | null;
  expires_at: string | null;
};

/** Everything the confirmation send needs, assembled here. */
export type EmailChangeConfirmationRequest = {
  tenantId: string;
  personId: string;
  personName: string | null;
  pendingEmail: string;
  /** The raw token. It is not stored anywhere; this is its only use. */
  token: string;
  tokenHash: string;
  expiresAt: Date;
  fallbackOrigin: string;
};

const NOT_AN_ADDRESS = "That does not look like an email address.";

const TAKEN =
  "We already have that address on another record. Ask us to merge the two rather than editing your way onto it.";

/**
 * Asks for the caller's own `people.email` to be changed.
 *
 * What this writes is a *request*: the pending address and the token's hash.
 * The record's address is untouched until the link sent to the new address is
 * followed, which is what makes a typo here harmless rather than a quiet
 * redirection of everything the organization writes to this person.
 *
 * The confirmation goes to the address being claimed, never to the session
 * that asked -- so the recipient is read off the row the database wrote rather
 * than off anything the caller supplied.
 */
export async function requestMyEmailChange(
  supabase: SupabaseClient,
  email: string,
  context: NotificationEmailContext,
): Promise<EmailChangeResult> {
  const trimmed = email.trim();
  // Checked here as well as in the RPC and the column's constraint, so the
  // form can say what is wrong without a round trip that reads as a failure.
  if (!trimmed || !isEmailAddress(trimmed)) {
    return actionError("invalid_input", NOT_AN_ADDRESS, {
      email: NOT_AN_ADDRESS,
    });
  }

  const { token, hash } = mintConfirmationToken();

  const { data, error } = await supabase.rpc("request_my_email_change", {
    p_email: trimmed,
    p_token_hash: hash,
  });
  if (error) {
    return actionError(
      "server_error",
      "Could not save that address. Please try again.",
    );
  }

  const row = ((data ?? []) as RequestEmailChangeRow[])[0];

  if (row?.outcome === "taken") {
    return actionError("conflict", TAKEN, { email: TAKEN });
  }

  if (row?.outcome === "pending" && row.pending_email && row.expires_at) {
    const owed: EmailChangeConfirmationRequest = {
      tenantId: row.tenant_id,
      personId: row.person_id,
      personName: row.display_name,
      pendingEmail: row.pending_email,
      token,
      tokenHash: hash,
      expiresAt: new Date(row.expires_at),
      fallbackOrigin: context.origin,
    };
    context.schedule(() => sendConfirmation(owed));
  }

  return {
    success: true,
    outcome: row?.outcome ?? "unchanged",
    pendingEmail: row?.pending_email ?? null,
    expiresAt: row?.expires_at ?? null,
  };
}

/**
 * Imported where it is used rather than at the top of the file, for the reason
 * notification-email-core.ts gives: the sender reaches `server-only` through
 * the delivery ledger, and this module is on the import path of the client
 * component that calls the action.
 */
async function sendConfirmation(
  request: EmailChangeConfirmationRequest,
): Promise<void> {
  const { sendEmailChangeConfirmation } =
    await import("@/lib/notifications/email-change-notifications");
  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");

  await sendEmailChangeConfirmation(createSupabaseAdminClient(), request);
}
