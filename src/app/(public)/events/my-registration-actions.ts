"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getClientIp } from "@/lib/get-client-ip";
import { getRequestOrigin } from "@/lib/request-origin";
import { sendEventRegistrationConfirmation } from "@/lib/notifications/submission-notifications";
import { PRONOUNS_TOO_LONG_ERROR } from "@/lib/pronouns";
import { MY_PATH_PREFIX } from "@/lib/constituent/paths";
import { publicEventPath } from "./event-path";

export type RegisterMyselfResult =
  { error: string } | { success: true; registrationId: string };

const ERROR_MESSAGES: Record<string, string> = {
  EVENT_NOT_FOUND: "This event could not be found.",
  REGISTRATION_CLOSED: "Registration is not open for this event.",
  REGISTRATION_DEADLINE_PASSED:
    "The registration deadline for this event has passed.",
  EVENT_AT_CAPACITY: "This event has reached capacity.",
  ALREADY_REGISTERED: "You are already registered for this event.",
  INVALID_PARTY_SIZE: "Party size must be at least 1.",
  PRONOUNS_TOO_LONG: PRONOUNS_TOO_LONG_ERROR,
  NO_RECORD: "We could not find your record. Please sign in again.",
  RATE_LIMITED: "Too many attempts — please try again in a few minutes.",
};

/**
 * Registers the signed-in caller for an event as themselves (#1165).
 *
 * The difference from `registerForEventAction` is one the person never sees
 * and the directory always does: this one sends no name and no email, because
 * `register_myself_for_event()` reads the person from the session and the
 * request host. There is nothing to match on, so there is no duplicate
 * `people` row to create -- which is the single largest source of them.
 *
 * No honeypot field either. The anonymous form carries one because anyone can
 * post to it; this path costs an account and a staff-approved claim, and a
 * hidden input would be a control that only catches somebody who has already
 * been let in.
 */
export async function registerMyselfForEventAction(
  eventId: string,
  formData: FormData,
): Promise<RegisterMyselfResult> {
  const partySize = Number(String(formData.get("partySize") ?? "1"));
  if (!Number.isInteger(partySize) || partySize < 1) {
    return { error: ERROR_MESSAGES.INVALID_PARTY_SIZE };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("register_myself_for_event", {
    p_event_id: eventId,
    p_party_size: partySize,
    p_notes: String(formData.get("notes") ?? ""),
    p_phone: String(formData.get("phone") ?? ""),
    p_pronouns: String(formData.get("pronouns") ?? ""),
    p_instagram_handle: String(formData.get("instagramHandle") ?? ""),
    p_ip_address: await getClientIp(),
  });

  if (error) {
    return {
      error:
        ERROR_MESSAGES[error.message] ??
        "Could not save your registration. Please try again.",
    };
  }

  revalidatePath(publicEventPath(eventId));
  revalidatePath(MY_PATH_PREFIX);
  revalidatePath("/portal/events");

  const registrationId = String(data);

  // After the response, never before it (#742), and through the same sender
  // the anonymous path uses -- a registration is a registration, and the
  // receipt should not depend on how it was made. It honours an opt-out now
  // (#1165): a person who has turned event confirmations off on `/my` gets
  // none, which is a switch only somebody with an account could have thrown.
  const siteUrl = await getRequestOrigin();

  after(async () => {
    await sendEventRegistrationConfirmation(createSupabaseAdminClient(), {
      registrationId,
      siteUrl,
    });
  });

  return { success: true, registrationId };
}
