import { afterResponse } from "@/lib/api/after-response";
import { publicWrite, unwrapId } from "@/lib/api/handler";
import { volunteerApplicationSchema } from "@/lib/api/schemas";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  notifyNewVolunteerApplication,
  notifyVolunteerApplicationConfirmation,
} from "@/lib/notifications/submission-notifications";

/**
 * Apply to volunteer. Answers with the reference code, which is the only key
 * to the status lookup below -- a consumer that discards it has discarded the
 * applicant's only way to ask.
 */
const route = publicWrite(
  volunteerApplicationSchema,
  async ({ supabase, body, clientIp, siteUrl, tenantId }) => {
    const referenceCode = unwrapId(
      await supabase.rpc("submit_volunteer_application", {
        p_name: body.name,
        p_email: body.email,
        p_phone: body.phone ?? null,
        p_role_interest: body.role_interest ?? null,
        p_availability: body.availability ?? null,
        p_pronouns: body.pronouns ?? null,
        p_ip_address: clientIp,
      }),
    );

    afterResponse(async () => {
      // Two independent sends (#1069): the volunteers queue hears about the
      // application, and the applicant gets the code. Separate dedupe keys and
      // separate outcomes, so neither is lost because the other bounced.
      const admin = createSupabaseAdminClient();
      await Promise.all([
        notifyNewVolunteerApplication(admin, {
          tenantId,
          referenceCode,
          siteUrl,
        }),
        notifyVolunteerApplicationConfirmation(admin, {
          tenantId,
          referenceCode,
          siteUrl,
        }),
      ]);
    });

    return { reference_code: referenceCode };
  },
);

export const POST = route.POST;
export const OPTIONS = route.OPTIONS;
