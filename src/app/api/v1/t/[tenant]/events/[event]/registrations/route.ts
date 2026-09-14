import { afterResponse } from "@/lib/api/after-response";
import { publicWrite, unwrapId } from "@/lib/api/handler";
import { eventRegistrationSchema } from "@/lib/api/schemas";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendEventRegistrationConfirmation } from "@/lib/notifications/submission-notifications";

/**
 * Register for an event. Capacity, the deadline, whether registration is open
 * at all and whether the Events module is even enabled are all decided inside
 * `register_for_event()`, not here: this handler is one more caller of an RPC
 * that has always had to defend itself against `curl`.
 */
const route = publicWrite<
  typeof eventRegistrationSchema,
  { tenant: string; event: string }
>(
  eventRegistrationSchema,
  async ({ supabase, params, body, clientIp, siteUrl }) => {
    const id = unwrapId(
      await supabase.rpc("register_for_event", {
        p_event_id: params.event,
        p_name: body.name,
        p_email: body.email,
        p_phone: body.phone ?? null,
        p_party_size: body.party_size,
        p_notes: body.notes ?? null,
        p_instagram_handle: body.instagram_handle ?? null,
        p_pronouns: body.pronouns ?? null,
        p_ip_address: clientIp,
      }),
    );

    afterResponse(async () => {
      await sendEventRegistrationConfirmation(createSupabaseAdminClient(), {
        registrationId: id,
        siteUrl,
      });
    });

    return { id };
  },
);

export const POST = route.POST;
export const OPTIONS = route.OPTIONS;
