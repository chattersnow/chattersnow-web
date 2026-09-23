"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getClientIp } from "@/lib/get-client-ip";
import { getRequestOrigin } from "@/lib/request-origin";
import { sendEventRegistrationConfirmation } from "@/lib/notifications/submission-notifications";
import {
  MINOR_CONTACTS_REQUIRED_CODE,
  MINOR_CONTACTS_REQUIRED_ERROR,
} from "@/lib/minors";
import { PRONOUNS_TOO_LONG_ERROR } from "@/lib/pronouns";
import { REGISTRATION_OPTION_ERROR_MESSAGES } from "@/lib/registration-options";
import { parseEventRegistrationForm } from "./event-registration-form";
import { publicEventPath } from "./event-path";
import {
  registrationErrorStep,
  registrationFieldStep,
  type RegistrationStep,
} from "./registration-step";

/**
 * `step` says which step of the form the error belongs to (#1403, #1413), so
 * a reader on the last step can be sent back to the field.
 */
export type RegisterForEventResult =
  | { error: string; step: RegistrationStep }
  | { success: true; registrationId: string };

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
  // #685. The form asks for these four the moment somebody answers yes, so
  // reaching this means a client that did not -- the public API, or a browser
  // that let a half-filled form through. Worth a sentence either way.
  [MINOR_CONTACTS_REQUIRED_CODE]: MINOR_CONTACTS_REQUIRED_ERROR,
  // #686. Three ways a waiver can stop a registration, and they are three
  // different things to say. The first is the reader's to fix; the second is
  // nobody's fault and asks them to read again; the third is the
  // organization's and is a state its own portal refuses to create.
  WAIVER_REQUIRED: "Please read the agreement and tick the box to register.",
  WAIVER_CHANGED:
    "The agreement was updated while you were filling this in. Reload the page, read it again, and register.",
  WAIVER_UNAVAILABLE:
    "This organization's participant agreement could not be loaded, so we can't take your registration right now. Please try again shortly.",
  RATE_LIMITED: "Too many attempts — please try again in a few minutes.",
  // #1407
  ...REGISTRATION_OPTION_ERROR_MESSAGES,
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
  if ("error" in parsed) {
    return { error: parsed.error, step: registrationFieldStep(parsed.field) };
  }

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
    // #1259. Sent for every registrant, whatever the email matches -- see the
    // RPC's comment for why asking selectively would be an enumeration oracle.
    // `undefined` for an unanswered question, so the RPC's own `default null`
    // is what lands rather than an explicit null; the row is the same either
    // way, and PostgREST prefers the argument omitted.
    p_attended_before: parsed.data.attended_before ?? undefined,
    // #686. Sent unconditionally, like the question above: the form does not
    // know whether this tenant has a waiver in force, and the RPC refuses or
    // records accordingly. `undefined` rather than null for the version, so an
    // unshown waiver leaves the RPC's own default in place.
    p_waiver_accepted: parsed.data.waiver_accepted,
    p_waiver_version: parsed.data.waiver_version ?? undefined,
    // #685. Sent as answered. The column is three-state and the RPC accepts a
    // null, but this form requires the question, so a null here would mean
    // the parser let something through.
    p_party_includes_minor: parsed.data.party_includes_minor,
    p_accompanying_adult_name: parsed.data.accompanying_adult_name ?? undefined,
    p_accompanying_adult_phone:
      parsed.data.accompanying_adult_phone ?? undefined,
    p_emergency_contact_name: parsed.data.emergency_contact_name ?? undefined,
    p_emergency_contact_phone: parsed.data.emergency_contact_phone ?? undefined,
    // #1407. `undefined` when the form showed no question, so the RPC's own
    // default stands; an event with options then refuses it.
    p_option_counts: parsed.data.option_counts ?? undefined,
    // No `p_photo_consent` (#1376). The parameter is still there, declared
    // `default null`, and the RPC is unchanged -- but the form has no box, so
    // there is nothing to send and `null` is the correct resting state: no
    // objection on record, agreement implied by registering. Writing `true`
    // would record an affirmative consent produced by a form with no
    // affirmative control. An API caller that genuinely asked can still send
    // one.
  });

  if (error) {
    return {
      error:
        ERROR_MESSAGES[error.message] ??
        "Could not save your registration. Please try again.",
      step: registrationErrorStep(error.message),
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
