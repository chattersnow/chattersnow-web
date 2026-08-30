"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getClientIp } from "@/lib/get-client-ip";
import { parseEventRegistrationForm } from "./event-registration-form";

export type RegisterForEventResult = { error: string } | { success: true };

const ERROR_MESSAGES: Record<string, string> = {
  EVENT_NOT_FOUND: "This event could not be found.",
  REGISTRATION_CLOSED: "Registration is not open for this event.",
  REGISTRATION_DEADLINE_PASSED:
    "The registration deadline for this event has passed.",
  EVENT_AT_CAPACITY: "This event has reached capacity.",
  ALREADY_REGISTERED: "This email is already registered for this event.",
  INVALID_PARTY_SIZE: "Party size must be at least 1.",
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

  const { error } = await supabase.rpc("register_for_event", {
    p_event_id: eventId,
    p_name: parsed.data.name,
    p_email: parsed.data.email,
    p_phone: parsed.data.phone,
    p_party_size: parsed.data.party_size,
    p_notes: parsed.data.notes,
    p_honeypot: honeypot,
    p_ip_address: ipAddress,
    p_instagram_handle: parsed.data.instagram_handle,
  });

  if (error) {
    return {
      error:
        ERROR_MESSAGES[error.message] ??
        "Could not save your registration. Please try again.",
    };
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath("/portal/events");
  return { success: true };
}
