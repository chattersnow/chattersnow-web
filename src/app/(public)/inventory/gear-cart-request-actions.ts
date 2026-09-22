"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getRequestOrigin } from "@/lib/request-origin";
import { getClientIp } from "@/lib/get-client-ip";
import {
  notifyNewGearRequest,
  sendGearRequestConfirmation,
} from "@/lib/notifications/submission-notifications";
import { getPublicGearRequestOptions } from "@/lib/gear-request-options";
import { parseGearRequestForm } from "./gear-request-form";

export type RequestGearItemsResult = { error: string } | { success: true };

const ERROR_MESSAGES: Record<string, string> = {
  NO_ITEMS: "Add at least one item to your cart before submitting.",
  ITEM_NOT_FOUND: "One of the items in your cart could not be found.",
  ITEM_ALREADY_REQUESTED:
    "Sorry, one of the items in your cart was just requested by someone else. Remove it and try again.",
  NAME_REQUIRED: "Name is required.",
  RATE_LIMITED: "Too many attempts — please try again in a few minutes.",
  DELIVERY_METHOD_INVALID: "Choose how you'd like to receive your items.",
  SHIPPING_UNAVAILABLE:
    "Shipping isn't available right now. Choose a meetup instead.",
  SHIPPING_ADDRESS_REQUIRED:
    "A street address, city and postal code are required for shipping.",
  PAYMENT_METHOD_INVALID: "Choose how you'll pay for the postage.",
};

// Public, unauthenticated action backing the gear library cart (#247):
// submits every selected item as one combined request. Availability is
// re-checked authoritatively inside the request_gear_items() RPC (each item
// row-locked, all-or-nothing), since the client's view of the cart can be
// stale and anon has no direct select/write access to inventory_items. The
// same goes for the delivery choice (#1032): whether shipping is offered and
// which payment methods count are the tenant's settings, and the RPC reads
// them itself.
export async function requestGearItemsAction(
  itemIds: string[],
  formData: FormData,
): Promise<RequestGearItemsResult> {
  if (itemIds.length === 0) return { error: ERROR_MESSAGES.NO_ITEMS };

  const supabase = await createSupabaseServerClient();

  const options = await getPublicGearRequestOptions(supabase);
  const parsed = parseGearRequestForm(formData, options);
  if ("error" in parsed) return parsed;

  const honeypot = String(formData.get("company") ?? "");
  const ipAddress = await getClientIp();

  const { data, error } = await supabase.rpc("request_gear_items", {
    p_inventory_item_ids: itemIds,
    p_name: parsed.data.name,
    p_email: parsed.data.email,
    p_phone: parsed.data.phone,
    p_instagram_handle: parsed.data.instagramHandle,
    p_notes: parsed.data.notes,
    p_honeypot: honeypot,
    p_ip_address: ipAddress,
    p_delivery_method: parsed.data.deliveryMethod,
    p_shipping: parsed.data.shipping,
    p_payment_method: parsed.data.paymentMethod,
  });

  if (error) {
    return {
      error:
        ERROR_MESSAGES[error.message] ??
        "Could not submit your request. Please try again.",
    };
  }

  revalidatePath("/inventory/library");
  revalidatePath("/portal/inventory/items");
  revalidatePath("/portal/inventory/requests");

  // After the response, never before it (#742): the hold is already
  // committed, and neither the staff notice nor the requester's own
  // confirmation may hold up "request received" or turn a committed request
  // into an error on screen. Read the origin first -- after() runs once the
  // response is on its way and may no longer have the request's headers.
  //
  // The only input reaching the service-role client is the id the RPC just
  // minted; for a filled honeypot that is a uuid with no row behind it, and
  // both senders treat that as nothing to do.
  const siteUrl = await getRequestOrigin();
  const requestId = data as string;

  after(async () => {
    const admin = createSupabaseAdminClient();
    await Promise.all([
      notifyNewGearRequest(admin, { requestId, siteUrl }),
      sendGearRequestConfirmation(admin, { requestId, siteUrl }),
    ]);
  });

  return { success: true };
}
