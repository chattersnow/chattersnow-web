"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getClientIp } from "@/lib/get-client-ip";
import { getRequestOrigin } from "@/lib/request-origin";
import { sendEventRegistrationConfirmation } from "@/lib/notifications/submission-notifications";
import { PRONOUNS_TOO_LONG_ERROR } from "@/lib/pronouns";
import { parseEventRegistrationForm } from "./event-registration-form";
import { publicEventPath } from "./event-path";

export type RegisterForEventResult =
  { error: string } | { success: true; registrationId: string };

const ERROR_MESSAGES: Record<string, string> = {
  EVENT_NOT_FOUND: "This event could not be found.",
  REGISTRATION_CLOSED: "Registration is not open for this event.",
  REGISTRATION_DEADLINE_PASSED:
    "The registration deadline for this event has passed.",
  EVENT_AT_CAPACITY: "This event has reached capacity.",
  ALREADY_REGISTERED: "This email is already registered for this event.",
  NAME_REQUIRED: "Name is required.",
  INVALID_PARTY_SIZE: "Party size must be at least 1.",
  PRONOUNS_TOO_LONG: PRONOUNS_TOO_LONG_ERROR,
  RATE_LIMITED: "Too many attempts — please try again in a few minutes.",
};

// Public, unauthenticated action: anyone can register for a published event
// with registration enabled. All validation (event must be public/
// published/registration_enabled, deadline, capacity) is re-checked
// authoritatively inside the register_for_event() RPC (spec §9 step 3),
// since the client's view of it can be stale and anon has no direct select
// access to event_registrations to check capacity itself.
export async function registerForEventAction(
  eventId: string,
  formData: FormData,
): Promise<RegisterForEventResult> {
  const parsed = parseEventRegistrationForm(formData);
  if ("error" in parsed) return parsed;

  const honeypot = String(formData.get("company") ?? "");
  const ipAddress = await getClientIp();

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("register_for_event", {
    p_event_id: eventId,
    p_name: parsed.data.name,
    p_email: parsed.data.email,
    p_phone: parsed.data.phone,
    p_party_size: parsed.data.party_size,
    p_notes: parsed.data.notes,
    p_honeypot: honeypot,
    p_ip_address: ipAddress,
    p_instagram_handle: parsed.data.instagram_handle,
    p_pronouns: parsed.data.pronouns,
  });

  if (error) {
    return {
      error:
        ERROR_MESSAGES[error.message] ??
        "Could not save your registration. Please try again.",
    };
  }

  revalidatePath(publicEventPath(eventId));
  revalidatePath("/portal/events");

  // The new registration id is handed back so the rider-profile follow-up
  // step (#564) can authorize its own write; it's an unguessable uuid and
  // reveals nothing about the event or other registrants.
  const registrationId = String(data);

  // After the response, never before it (#742): the registration is already
  // committed, and the registrant's confirmation must not hold up "you're
  // registered" or turn a committed registration into an error on screen.
  // Read the origin first -- after() runs once the response is on its way and
  // may no longer have the request's headers. It is only the fallback: a tenant
  // with a domain of its own is linked to that instead (#860).
  //
  // The only input reaching the service-role client is the id the RPC just
  // minted; for a filled honeypot that is a uuid with no row behind it, which
  // the sender treats as nothing to do.
  const siteUrl = await getRequestOrigin();

  after(async () => {
    await sendEventRegistrationConfirmation(createSupabaseAdminClient(), {
      registrationId,
      siteUrl,
    });
  });

  return { success: true, registrationId };
}
