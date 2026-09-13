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
import { sendNotificationEmailChanged } from "@/lib/notifications/notification-email-confirmation";

export type ConfirmNotificationEmailResult =
  { error: string } | { success: true; confirmedEmail: string };

/**
 * One message for an unknown token, an expired one and one already used
 * (#1049). They are genuinely different, and telling them apart would let
 * somebody with a list of guesses learn which of them were ever real -- while
 * the person holding a real link needs the same next step in all three cases.
 */
const LINK_DEAD =
  "This link has expired or has already been used. Ask for a new one from your account page.";

/**
 * Proves the person asking holds the address, and only then does the pending
 * override become the one mail is delivered to.
 *
 * Deliberately not gated on a session. The link is followed from the mailbox
 * being claimed, which is regularly not the browser the portal session lives in
 * -- a work address opened on a phone, an address a colleague forwards. The
 * token is the proof being asked for; a sign-in requirement would reject
 * exactly the case this exists to serve while proving nothing extra.
 *
 * A Server Action rather than a GET route, because a GET that confirms is a
 * GET that a mail client's link scanner confirms first. The button is the
 * person.
 */
export async function confirmNotificationEmailAction(
  token: string,
): Promise<ConfirmNotificationEmailResult> {
  // Checked before it is hashed, so a stray query parameter never becomes a
  // database lookup at all.
  if (!isConfirmationToken(token)) return { error: LINK_DEAD };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("confirm_notification_email", {
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

  // Read before after(), which runs once the response is on its way and may no
  // longer have the request's headers.
  const origin = await getRequestOrigin();

  after(async () => {
    await sendNotificationEmailChanged(createSupabaseAdminClient(), {
      tenantId: row.tenant_id,
      personId: row.person_id,
      previousEmail: row.previous_email ?? "",
      confirmedEmail: row.confirmed_email,
      tokenHash: hashConfirmationToken(token),
      fallbackOrigin: origin,
    });
  });

  return { success: true, confirmedEmail: row.confirmed_email };
}

type ConfirmedRow = {
  person_id: string;
  tenant_id: string;
  confirmed_email: string;
  previous_email: string | null;
  display_name: string | null;
};
