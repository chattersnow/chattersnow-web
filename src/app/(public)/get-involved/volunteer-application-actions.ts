"use server";

import { after } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getClientIp } from "@/lib/get-client-ip";
import { PRONOUNS_TOO_LONG_ERROR } from "@/lib/pronouns";
import { notifyNewVolunteerApplication } from "@/lib/notifications/submission-notifications";
import { parseVolunteerApplicationForm } from "./volunteer-application-form";

export type SubmitVolunteerApplicationResult =
  { error: string } | { success: true; referenceCode: string };

const ERROR_MESSAGES: Record<string, string> = {
  NAME_REQUIRED: "Name is required.",
  INVALID_EMAIL: "A valid email is required.",
  ALREADY_SUBMITTED:
    "We already have a recent application from this email — we'll be in touch soon.",
  PRONOUNS_TOO_LONG: PRONOUNS_TOO_LONG_ERROR,
  RATE_LIMITED: "Too many attempts — please try again in a few minutes.",
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
  const ipAddress = await getClientIp();

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("submit_volunteer_application", {
    p_name: parsed.data.name,
    p_email: parsed.data.email,
    p_phone: parsed.data.phone,
    p_role_interest: parsed.data.role_interest,
    p_availability: parsed.data.availability,
    p_honeypot: honeypot,
    p_ip_address: ipAddress,
    p_pronouns: parsed.data.pronouns,
  });

  if (error) {
    return {
      error:
        ERROR_MESSAGES[error.message] ??
        "Could not submit your application. Please try again.",
    };
  }

  const referenceCode = data as string;

  // After the response, never before it (#742): a slow provider or a failed
  // send must not delay the reference code the applicant is waiting for, nor
  // turn a committed application into an error on screen.
  //
  // The tenant comes from the request host, resolved in Postgres by the same
  // public_tenant_id() the RPC itself used. It has to be carried explicitly,
  // because a reference code is only unique *within* a tenant and the
  // service-role lookup below has no RLS to keep it in one.
  after(async () => {
    const { data: tenantId } = await supabase.rpc("public_tenant_id");
    if (!tenantId) return;

    await notifyNewVolunteerApplication(createSupabaseAdminClient(), {
      tenantId: tenantId as string,
      referenceCode,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "",
    });
  });

  return { success: true, referenceCode };
}
