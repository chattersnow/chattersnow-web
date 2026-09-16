"use server";

import { after } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getClientIp } from "@/lib/get-client-ip";
import { getRequestOrigin } from "@/lib/request-origin";
import {
  hashConfirmationToken,
  isConfirmationToken,
} from "@/lib/notifications/notification-email-token";
import { sendEmailChanged } from "@/lib/notifications/email-change-notifications";

export type ConfirmEmailChangeResult =
  { error: string } | { success: true; confirmedEmail: string };

/**
 * One message for an unknown token, an expired one and one already used, for
 * the reason #1049 gives: telling them apart would let somebody with a list of
 * guesses learn which of them were ever real, while the person holding a real
 * link needs the same next step in all three cases.
 */
const LINK_DEAD =
  "This link has expired or has already been used. Ask for a new one from your account page.";

/**
 * Somebody else's record took the address during the day the link was alive.
 * Said plainly, because the person following the link has done nothing wrong
 * and the next step is a conversation rather than another attempt.
 */
const TAKEN =
  "That address is now on another record with us. Get in touch and we will sort out which record is yours.";

/**
 * Proves the person asking holds the address, and only then does it become the
 * one on their record (#1164).
 *
 * Deliberately not gated on a session, and a Server Action rather than a GET
 * route, for the two reasons `confirmNotificationEmailAction` documents: the
 * link is followed from the mailbox being claimed, which is often not the
 * browser the session lives in, and a GET that confirms is a GET that a mail
 * client's link scanner confirms first.
 */
export async function confirmEmailChangeAction(
  token: string,
): Promise<ConfirmEmailChangeResult> {
  // Checked before it is hashed, so a stray query parameter never becomes a
  // database lookup at all.
  if (!isConfirmationToken(token)) return { error: LINK_DEAD };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("confirm_email_change", {
    p_token_hash: hashConfirmationToken(token),
    p_ip_address: await getClientIp(),
  });

  if (error) {
    // The limiter is the only thing this RPC raises for; everything else it
    // declines to answer is an empty result.
    return {
      error: error.message.includes("Too many")
        ? "Too many attempts. Please try again in a few minutes."
        : LINK_DEAD,
    };
  }

  const row = ((data ?? []) as ConfirmedRow[])[0];
  if (!row) return { error: LINK_DEAD };
  if (row.outcome === "taken") return { error: TAKEN };
  if (!row.confirmed_email) return { error: LINK_DEAD };

  // Read before after(), which runs once the response is on its way and may no
  // longer have the request's headers.
  const origin = await getRequestOrigin();

  after(async () => {
    await sendEmailChanged(createSupabaseAdminClient(), {
      tenantId: row.tenant_id,
      personId: row.person_id,
      previousEmail: row.previous_email,
      confirmedEmail: row.confirmed_email as string,
      tokenHash: hashConfirmationToken(token),
      fallbackOrigin: origin,
    });
  });

  return { success: true, confirmedEmail: row.confirmed_email };
}

type ConfirmedRow = {
  outcome: "confirmed" | "taken";
  person_id: string;
  tenant_id: string;
  confirmed_email: string | null;
  previous_email: string | null;
  display_name: string | null;
};
