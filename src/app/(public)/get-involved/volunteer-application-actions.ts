"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseVolunteerApplicationForm } from "./volunteer-application-form";

export type SubmitVolunteerApplicationResult =
  { error: string } | { success: true };

const ERROR_MESSAGES: Record<string, string> = {
  NAME_REQUIRED: "Name is required.",
  INVALID_EMAIL: "A valid email is required.",
  ALREADY_SUBMITTED:
    "We already have a recent application from this email — we'll be in touch soon.",
};

// Public, unauthenticated action: anyone can submit a volunteer application.
// Validation, the honeypot check, and the per-email throttle are all
// re-enforced authoritatively inside the submit_volunteer_application() RPC,
// since anon has no direct table access to volunteer_applications.
export async function submitVolunteerApplicationAction(
  formData: FormData,
): Promise<SubmitVolunteerApplicationResult> {
  const parsed = parseVolunteerApplicationForm(formData);
  if ("error" in parsed) return parsed;

  const honeypot = String(formData.get("company") ?? "");

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("submit_volunteer_application", {
    p_name: parsed.data.name,
    p_email: parsed.data.email,
    p_phone: parsed.data.phone,
    p_role_interest: parsed.data.role_interest,
    p_availability: parsed.data.availability,
    p_honeypot: honeypot,
  });

  if (error) {
    return {
      error:
        ERROR_MESSAGES[error.message] ??
        "Could not submit your application. Please try again.",
    };
  }

  return { success: true };
}
