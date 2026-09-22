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
        // #685. `undefined` rather than null for the question itself, so a
        // caller that says nothing leaves the RPC's own default in place and
        // the row records that nobody was asked. A caller that says `true`
        // gets MINOR_CONTACTS_REQUIRED unless the four arrive with it.
        p_party_includes_minor: body.party_includes_minor ?? undefined,
        p_accompanying_adult_name: body.accompanying_adult_name ?? null,
        p_accompanying_adult_phone: body.accompanying_adult_phone ?? null,
        p_emergency_contact_name: body.emergency_contact_name ?? null,
        p_emergency_contact_phone: body.emergency_contact_phone ?? null,
        // #1366. `undefined` for both, so a caller that sends neither leaves
        // the RPC's own defaults in place -- which is the right answer for
        // every tenant that has adopted no waiver, and the only answer for a
        // caller written before the question existed. A tenant that has
        // adopted one refuses the registration instead of taking it without
        // the agreement it says governs taking part.
        p_waiver_accepted: body.waiver_accepted ?? undefined,
        p_waiver_version: body.waiver_version ?? undefined,
        // #599, and `undefined` here is load-bearing rather than tidy: it is
        // how "this caller did not ask" reaches the RPC, which records null
        // instead of inventing either answer. A `false` is a decline and is
        // stored as one. The words the answer is recorded against come from
        // the organization's own row, never from this body.
        p_photo_consent: body.photo_consent ?? undefined,
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
