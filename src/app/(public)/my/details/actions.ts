"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseMyContactForm } from "@/lib/constituent/contact";
import {
  requestMyEmailChange,
  type EmailChangeResult,
} from "@/lib/constituent/email-change";
import { requestNotificationEmailContext } from "@/lib/notifications/notification-email-request";
import { MY_PATH_PREFIX } from "@/lib/constituent/paths";

const MY_DETAILS_PATH = `${MY_PATH_PREFIX}/details`;

export type SaveContactDetailsResult = { error: string } | { saved: true };

/**
 * Saves the allowlisted fields of the caller's own record (#1164).
 *
 * This action is not the control and must not be mistaken for one. It sends
 * the allowed fields because they are the only arguments
 * `set_my_contact_details()` has; an action that sent more would not compile,
 * and one that called `.from("people").update()` instead would be refused by
 * the `people update` policy, which requires people:manage. The allowlist
 * lives in the database, and the integration test proves it there.
 *
 * No permission check here for the same reason `set_my_preferred_name`'s
 * caller has none: authorization is "this row is yours", and the RPC resolves
 * whose row it is from `auth.uid()` and the request host rather than from
 * anything this function passes it.
 */
export async function saveMyContactDetailsAction(
  formData: FormData,
): Promise<SaveContactDetailsResult> {
  const parsed = parseMyContactForm(formData);
  if ("error" in parsed) return parsed;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_my_contact_details", parsed.args);

  if (error) {
    // The RPC raises for a record it will not serve -- signed out, unlinked,
    // or the tenant has the area off -- and for a value its own checks refuse.
    // Neither is worth echoing verbatim: the first is a state this page cannot
    // be in without a stale tab, and the second is already caught above.
    return { error: "Could not save your details. Please try again." };
  }

  revalidatePath(MY_DETAILS_PATH);
  revalidatePath(MY_PATH_PREFIX);
  return { saved: true };
}

/**
 * Asks for the address on the caller's own record to be changed (#1164).
 *
 * Nothing moves here. The address is recorded as pending and a link is sent to
 * it; `people.email` changes only when that link comes back. See
 * `requestMyEmailChange` for why this one column does not travel with the rest
 * of the form.
 */
export async function requestMyEmailChangeAction(
  email: string,
): Promise<EmailChangeResult> {
  const supabase = await createSupabaseServerClient();
  const result = await requestMyEmailChange(
    supabase,
    email,
    // Read here rather than inside the deferred send: after() runs once the
    // response is on its way and may no longer have the request's headers.
    await requestNotificationEmailContext(),
  );

  if ("success" in result) revalidatePath(MY_DETAILS_PATH);
  return result;
}
