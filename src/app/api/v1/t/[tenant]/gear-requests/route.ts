import { afterResponse } from "@/lib/api/after-response";
import { publicWrite, unwrapId } from "@/lib/api/handler";
import { gearRequestSchema } from "@/lib/api/schemas";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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
 */
const route = publicWrite(
  gearRequestSchema,
  async ({ supabase, body, clientIp, siteUrl }) => {
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
