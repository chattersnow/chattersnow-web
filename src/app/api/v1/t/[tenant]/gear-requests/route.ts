import { afterResponse } from "@/lib/api/after-response";
import { publicWrite, unwrapId } from "@/lib/api/handler";
import { gearRequestSchema } from "@/lib/api/schemas";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { gearAsIsText } from "@/lib/gear-as-is";
import { getPublicLexicon } from "@/lib/lexicon";
import {
  notifyNewGearRequest,
  sendGearRequestConfirmation,
} from "@/lib/notifications/submission-notifications";

/**
 * Request items from the lending library.
 *
 * Whether shipping is on offer at all, and whether the payment method is one
 * this organization accepts, are re-decided inside `request_gear_items()`
 * against the tenant's own settings. The schema only checks that what arrived
 * is the right shape -- a consumer should read `/gear-request-settings` before
 * rendering a form, the same way the site's cart does.
 *
 * **The third caller, and it is wired up here rather than found later** (#1367,
 * #1366). `request_gear_items()` gained the as-is acknowledgement and this
 * route takes it, so adopting the feature does not silently break the headless
 * path the way the waiver did for event registrations. The *wording* is not
 * taken from the caller: it is resolved here, from the platform's own constant
 * against this tenant's lexicon, exactly as the site's cart resolves it. A
 * snapshot a client supplied would record what that client said it showed.
 */
const route = publicWrite(
  gearRequestSchema,
  async ({ supabase, body, clientIp, siteUrl }) => {
    const lexicon = await getPublicLexicon(supabase);
    const id = unwrapId(
      await supabase.rpc("request_gear_items", {
        p_inventory_item_ids: body.item_ids,
        p_name: body.name,
        p_email: body.email,
        p_phone: body.phone ?? null,
        p_instagram_handle: body.instagram_handle ?? null,
        p_notes: body.notes ?? null,
        p_delivery_method: body.delivery_method ?? null,
        p_shipping: body.shipping ?? null,
        p_payment_method: body.payment_method ?? null,
        p_as_is_acknowledged: body.as_is_acknowledged,
        p_as_is_text: gearAsIsText(lexicon),
        p_ip_address: clientIp,
      }),
    );

    afterResponse(async () => {
      const admin = createSupabaseAdminClient();
      await Promise.all([
        notifyNewGearRequest(admin, { requestId: id, siteUrl }),
        sendGearRequestConfirmation(admin, { requestId: id, siteUrl }),
      ]);
    });

    return { id };
  },
);

export const POST = route.POST;
export const OPTIONS = route.OPTIONS;
