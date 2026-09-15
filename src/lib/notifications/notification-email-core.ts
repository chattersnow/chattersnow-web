// Setting where a person's portal email is delivered, with no Next in it
// (#1125, following the #1082 Phase 1 cores -- see home/donation-core.ts for
// why those exist).
//
// Two surfaces write this column: /portal/account, where somebody sets their
// own, and a person record, where people:manage sets somebody else's (#1049).
// They are genuinely different writes -- a different RPC, a different
// permission, and one of them is an administrator acting on another person's
// behalf -- so they stay two entry points. What they may not be is two copies
// of the decision that follows the write: whether a confirmation is owed, and
// with what arguments. Before this module they were, in two files with two
// shapes, and a third consumer performing this write would have sent nothing
// at all, staging a pending address nobody was ever asked to confirm.
//
// The send is deferred rather than awaited, for the reason the contact form
// gives: a slow provider or a missing key must not hold up the save, and a
// failed send must not turn a committed request into an error on screen.
// Deferring is Next's `after()` in this app, so it arrives as an injected
// scheduler; the decision and the arguments stay here.
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkUser } from "@/lib/auth/current-user";
import { checkPermission } from "@/lib/auth/permissions";
import { isEmailAddress } from "@/lib/email/identity";
import {
  actionError,
  fromGuard,
  type ActionFailure,
} from "@/lib/portal/action-result";
import { mintConfirmationToken } from "./notification-email-token";

/**
 * What both setters answer, and what the two Server Actions branch on.
 *
 * 'cleared' and 'unchanged' are finished when the RPC returns: nothing is sent,
 * because both land on an address somebody has already proved they hold.
 * 'pending' is the only outcome with a message behind it.
 */
export type NotificationEmailOutcome = "cleared" | "unchanged" | "pending";

/**
 * What both paths hand back, in the #1082 Phase 2 envelope. The outcome rides
 * along because the two surfaces say something different for each: "waiting on
 * a link sent to X" reads as a failure if it is reported as a plain save.
 */
export type NotificationEmailResult =
  | ActionFailure
  | {
      success: true;
      outcome: NotificationEmailOutcome;
      pendingEmail: string | null;
    };

/** One row of set_my_notification_email / set_notification_email_for_person. */
export type SetNotificationEmailRow = {
  outcome: NotificationEmailOutcome;
  person_id: string;
  tenant_id: string;
  display_name: string | null;
  pending_email: string | null;
  expires_at: string | null;
};

/** Everything sendNotificationEmailConfirmation() needs, assembled here. */
export type NotificationEmailConfirmationRequest = {
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

/**
 * The Next-shaped half of this write, supplied by the caller so the core does
 * not have to know about it.
 *
 * `origin` is read by the caller rather than here because in Next it comes off
 * the request's headers, which are gone by the time a deferred task runs.
 * `schedule` runs a task once the response is on its way -- `after()` in the
 * Server Actions, and in a test whatever lets the test run it and look.
 */
export type NotificationEmailContext = {
  origin: string;
  schedule: (task: () => Promise<void>) => void;
};

const NOT_AN_ADDRESS = "That does not look like an email address.";

/**
 * Whether this row leaves a confirmation owed, and to whom.
 *
 * The link goes to the address being claimed, never to whoever typed it
 * (#1049). An administrator can ask on somebody's behalf; they cannot complete
 * the loop for a mailbox they do not hold, which is the whole point of the
 * step -- so the recipient is read off the row the database wrote, not off the
 * session that called it.
 */
export function confirmationOwedFor(
  row: SetNotificationEmailRow | undefined,
  token: string,
  tokenHash: string,
  origin: string,
): NotificationEmailConfirmationRequest | null {
  if (row?.outcome !== "pending" || !row.pending_email || !row.expires_at) {
    return null;
  }

  return {
    tenantId: row.tenant_id,
    personId: row.person_id,
    personName: row.display_name,
    pendingEmail: row.pending_email,
    token,
    tokenHash,
    expiresAt: new Date(row.expires_at),
    fallbackOrigin: origin,
  };
}

/**
 * Sets the signed-in person's own delivery address (#1042), behind a
 * confirmation since #1049.
 *
 * An address only ever reaches `notification_email` by way of a token sent to
 * it, so what this writes is a *request*: the pending address plus the token's
 * hash. Delivery is untouched until the link is followed, which is what makes a
 * typo here harmless rather than a disclosure.
 *
 * Empty, or the address the account signs in with, clears the override instead
 * and takes effect at once -- both land on an address the identity provider has
 * already proved, so there is nothing left to prove. Neither path touches
 * people.email: that column binds the account to its directory record, and
 * editing it to redirect mail is what this field exists to stop.
 *
 * No permission check, and a security-definer RPC, for the reasons
 * set_my_preferred_name has both: it only ever writes the caller's own row, and
 * people.update RLS requires people:manage, which board and volunteer accounts
 * don't hold.
 */
export async function setMyNotificationEmail(
  supabase: SupabaseClient,
  email: string,
  context: NotificationEmailContext,
): Promise<NotificationEmailResult> {
  const userResult = await checkUser(supabase);
  if ("error" in userResult) return fromGuard("unauthenticated", userResult);

  return applyNotificationEmail(supabase, email, context, {
    rpc: "set_my_notification_email",
    args: {},
    failure: "Could not save your notification email. Please try again.",
  });
}

/**
 * Sets one other person's delivery address (#1042). Empty clears the override,
 * returning delivery to the address they sign in with.
 *
 * people:manage, not administration:manage as linkPersonToAuthUserAction: this
 * writes one column of one directory row rather than touching the binding
 * between a record and a login. The person can always overrule it for
 * themselves at /portal/account.
 */
export async function setNotificationEmailForPerson(
  supabase: SupabaseClient,
  personId: string,
  email: string,
  context: NotificationEmailContext,
): Promise<NotificationEmailResult> {
  const userResult = await checkUser(supabase);
  if ("error" in userResult) return fromGuard("unauthenticated", userResult);
  const permissionError = await checkPermission(supabase, "people", "manage");
  if (permissionError) return fromGuard("forbidden", permissionError);

  return applyNotificationEmail(supabase, email, context, {
    rpc: "set_notification_email_for_person",
    args: { p_person_id: personId },
    failure: "Could not save the notification email. Please try again.",
  });
}

/**
 * The half the two share: validate, mint, write, and schedule whatever the
 * write left owed. The guards stay with the callers above, because which of
 * them applies is the one thing that genuinely differs.
 */
async function applyNotificationEmail(
  supabase: SupabaseClient,
  email: string,
  context: NotificationEmailContext,
  write: { rpc: string; args: Record<string, unknown>; failure: string },
): Promise<NotificationEmailResult> {
  const trimmed = email.trim();
  // Checked here as well as in the RPC and the column's constraint, so the
  // form can say what is wrong without a round trip that reads as a failure.
  if (trimmed && !isEmailAddress(trimmed)) {
    return actionError("invalid_input", NOT_AN_ADDRESS, {
      email: NOT_AN_ADDRESS,
    });
  }

  const { token, hash } = mintConfirmationToken();

  const { data, error } = await supabase.rpc(write.rpc, {
    ...write.args,
    p_email: trimmed,
    p_token_hash: trimmed ? hash : null,
  });
  if (error) return actionError("server_error", write.failure);

  const row = ((data ?? []) as SetNotificationEmailRow[])[0];
  const owed = confirmationOwedFor(row, token, hash, context.origin);
  if (owed) context.schedule(() => sendConfirmation(owed));

  return {
    success: true,
    outcome: row?.outcome ?? "cleared",
    pendingEmail: row?.pending_email ?? null,
  };
}

/**
 * Imported where it is used rather than at the top of the file: the sender
 * reaches `server-only` through the delivery ledger, and this module is on the
 * import path of the client components that call the two actions.
 */
async function sendConfirmation(
  request: NotificationEmailConfirmationRequest,
): Promise<void> {
  const { sendNotificationEmailConfirmation } =
    await import("./notification-email-confirmation");
  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");

  await sendNotificationEmailConfirmation(createSupabaseAdminClient(), request);
}
