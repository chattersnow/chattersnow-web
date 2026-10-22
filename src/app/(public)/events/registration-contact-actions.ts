"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getClientIp } from "@/lib/get-client-ip";
import { myRegistrationClaimPath } from "@/lib/constituent/paths";
import {
  hashConfirmationToken,
  isConfirmationToken,
} from "@/lib/notifications/notification-email-token";
import { ANSWER_LINK_INVALID } from "@/lib/registration-answer-requests";
import {
  contactError,
  REGISTRATION_CONTACT_ERROR_MESSAGES,
  type ContactValues,
} from "@/lib/registration-contact";

export type SaveRegistrationContactResult =
  { error: string; linkInvalid?: boolean } | { success: true };

const ERROR_MESSAGES: Record<string, string> = {
  ...REGISTRATION_CONTACT_ERROR_MESSAGES,
  // One message for somebody else's registration and no record at all, as the
  // other /my cards do: telling them apart would be a way to test ids.
  REGISTRATION_NOT_FOUND:
    "We could not find that registration on your account.",
  NO_RECORD: "We could not find that registration on your account.",
  REGISTRATION_CANCELLED:
    "This registration has been cancelled, so it can't be changed here.",
  EVENT_ENDED: "This event has ended, so this can't be changed any more.",
};

/** The RPC parameters for a form's answer. The RPC validates again. */
function contactParams(values: ContactValues) {
  return values.hasNoInstagram
    ? {
        p_instagram_handle: null,
        p_has_no_instagram: true,
        p_preferred_contact_method: values.method,
        p_preferred_contact_detail: values.detail.trim() || null,
      }
    : {
        p_instagram_handle: values.instagramHandle.trim().replace(/^@/, ""),
        p_has_no_instagram: false,
        p_preferred_contact_method: null,
        p_preferred_contact_detail: null,
      };
}

function message(code: string): string {
  return ERROR_MESSAGES[code] ?? "Could not save that. Please try again.";
}

/**
 * The registrant's own handle or contact, from `/my/registration/[id]`
 * (#1647). `set_my_registration_contact()` resolves the person itself and
 * holds the answer to the same rule as registering.
 */
export async function setMyRegistrationContactAction(
  registrationId: string,
  values: ContactValues,
): Promise<SaveRegistrationContactResult> {
  const problem = contactError(values, true);
  if (problem) return { error: problem };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_my_registration_contact", {
    p_registration_id: registrationId,
    ...contactParams(values),
  });
  if (error) return { error: message(error.message) };

  revalidatePath(myRegistrationClaimPath(registrationId));
  return { success: true };
}

/**
 * The same, through the emailed answers link (#1647). No session: the token
 * is the permission, as it is for the answers beside it.
 */
export async function submitRegistrationContactByLinkAction(
  token: string,
  values: ContactValues,
): Promise<SaveRegistrationContactResult> {
  if (!isConfirmationToken(token)) {
    return { error: ANSWER_LINK_INVALID, linkInvalid: true };
  }
  const problem = contactError(values, true);
  if (problem) return { error: problem };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("submit_registration_contact_by_token", {
    p_token_hash: hashConfirmationToken(token),
    ...contactParams(values),
    p_ip_address: await getClientIp(),
  });
  if (error) {
    if (error.message === "LINK_INVALID") {
      return { error: ANSWER_LINK_INVALID, linkInvalid: true };
    }
    if (error.message.includes("Too many")) {
      return { error: "Too many attempts. Please try again in a few minutes." };
    }
    return { error: message(error.message) };
  }
  return { success: true };
}
