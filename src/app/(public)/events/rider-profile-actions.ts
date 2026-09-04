"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getClientIp } from "@/lib/get-client-ip";
import { parseRiderProfileForm } from "@/lib/rider-profile-form";

export type SaveRiderProfileResult = { error: string } | { success: true };

const ERROR_MESSAGES: Record<string, string> = {
  // Deliberately reassuring: the registration itself is already saved, and
  // nothing here can undo it (issue #564 -- this step is never a gate).
  RIDER_PROFILE_UNAVAILABLE:
    "You're registered — we just couldn't save your ride details. Reply to your confirmation and we'll add them.",
  INVALID_RIDER_PROFILE: "Please check your answers and try again.",
  RATE_LIMITED: "Too many attempts — please try again in a few minutes.",
};

// Public, unauthenticated action: the follow-up step shown after a successful
// event registration. The registration id returned by registerForEventAction
// is the authorization — save_registrant_rider_profile() re-checks that it
// names a real, recent registration, since anon has no direct access to
// event_registrations or people.
export async function saveRiderProfileAction(
  registrationId: string,
  formData: FormData,
): Promise<SaveRiderProfileResult> {
  const parsed = parseRiderProfileForm(formData);
  if ("error" in parsed) return parsed;

  const honeypot = String(formData.get("company") ?? "");
  const ipAddress = await getClientIp();

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("save_registrant_rider_profile", {
    p_registration_id: registrationId,
    p_riding_discipline: parsed.data.riding_discipline,
    p_ski_experience_level: parsed.data.ski_experience_level,
    p_snowboard_experience_level: parsed.data.snowboard_experience_level,
    p_preferred_mountain: parsed.data.preferred_mountain,
    p_honeypot: honeypot,
    p_ip_address: ipAddress,
  });

  if (error) {
    return {
      error:
        ERROR_MESSAGES[error.message] ??
        "Could not save your ride details. Please try again.",
    };
  }

  // Nothing public renders this, so there's no path to revalidate.
  return { success: true };
}
