"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getRequestOrigin } from "@/lib/request-origin";
import { getClientIp } from "@/lib/get-client-ip";
import {
  notifyNewGearRequest,
  sendGearRequestConfirmation,
} from "@/lib/notifications/submission-notifications";
import { gearAsIsText } from "@/lib/gear-as-is";
import { getPublicGearRequestOptions } from "@/lib/gear-request-options";
import { getPublicLexicon } from "@/lib/lexicon";
import type { PublicGearRequestOptions } from "@/lib/gear-requests";
import { loadConstituentViewer } from "@/lib/constituent/viewer";
import {
  parseGearRequestDelivery,
  parseGearRequestForm,
} from "./gear-request-form";

export type RequestGearItemsResult =
  | { error: string }
  // The id comes back so the receipt can offer to keep the request (#1359).
  // For a filled honeypot it is the throwaway uuid the RPC mints with no row
  // behind it, and that is fine: everything the offer leads to is silent, so
  // following it teaches a bot nothing.
  | { success: true; requestId: string };

const ERROR_MESSAGES: Record<string, string> = {
  NO_ITEMS: "Add at least one item to your cart before submitting.",
  ITEM_NOT_FOUND: "One of the items in your cart could not be found.",
  ITEM_ALREADY_REQUESTED:
    "Sorry, one of the items in your cart was just requested by someone else. Remove it and try again.",
  NAME_REQUIRED: "Name is required.",
  NO_RECORD: "We could not find your record. Please sign in again.",
  AS_IS_REQUIRED:
    "Please tick the box to confirm you understand these items are given as-is.",
  RATE_LIMITED: "Too many attempts — please try again in a few minutes.",
  DELIVERY_METHOD_INVALID: "Choose how you'd like to receive your items.",
  SHIPPING_UNAVAILABLE:
    "Shipping isn't available right now. Choose a meetup instead.",
  SHIPPING_ADDRESS_REQUIRED:
    "A street address, city and postal code are required for shipping.",
  PAYMENT_METHOD_INVALID: "Choose how you'll pay for the postage.",
};

// Public action backing the gear library cart (#247): submits every selected
// item as one combined request. Availability is re-checked authoritatively in
// the database (each item row-locked, all-or-nothing), since the client's view
// of the cart can be stale and anon has no direct select/write access to
// inventory_items. The same goes for the delivery choice (#1032): whether
// shipping is offered and which payment methods count are the tenant's
// settings, and the database reads them itself.
export async function requestGearItemsAction(
  itemIds: string[],
  formData: FormData,
): Promise<RequestGearItemsResult> {
  if (itemIds.length === 0) return { error: ERROR_MESSAGES.NO_ITEMS };

  const supabase = await createSupabaseServerClient();

  const [options, viewer, lexicon] = await Promise.all([
    getPublicGearRequestOptions(supabase),
    loadConstituentViewer(supabase),
    // The as-is wording, in this organization's noun (#1367). Resolved here
    // and never taken from the browser: what lands in `gear_requests.as_is_text`
    // has to be what the platform says, not what a client claims it showed.
    getPublicLexicon(supabase),
  ]);
  const ipAddress = await getClientIp();
  const asIsText = gearAsIsText(lexicon);

  // Which person the request lands on is decided here, from the session, and
  // never from anything the browser sent (#1359). A reader with an approved
  // claim goes down request_gear_items_as_me(), which reads the person from
  // auth.uid() and so cannot mint a second `people` row however they have
  // since edited their own details. Everybody else -- including an account
  // whose claim is still pending -- goes down the anonymous path, which
  // matches or creates a person from the typed address.
  const submitted =
    viewer?.kind === "linked"
      ? await submitAsMe(
          supabase,
          itemIds,
          formData,
          options,
          ipAddress,
          asIsText,
        )
      : await submitAnonymously(
          supabase,
          itemIds,
          formData,
          options,
          ipAddress,
          asIsText,
        );

  if ("error" in submitted) return submitted;
  const { requestId } = submitted;

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

  after(async () => {
    const admin = createSupabaseAdminClient();
    await Promise.all([
      notifyNewGearRequest(admin, { requestId, siteUrl }),
      sendGearRequestConfirmation(admin, { requestId, siteUrl }),
    ]);
  });

  return { success: true, requestId };
}

type Submitted = { error: string } | { requestId: string };

function rpcFailed(message: string): Submitted {
  return {
    error:
      ERROR_MESSAGES[message] ??
      "Could not submit your request. Please try again.",
  };
}

/** The visitor's path: the person is matched or minted from the typed email. */
async function submitAnonymously(
  supabase: SupabaseClient,
  itemIds: string[],
  formData: FormData,
  options: PublicGearRequestOptions,
  ipAddress: string | null,
  asIsText: string,
): Promise<Submitted> {
  const parsed = parseGearRequestForm(formData, options);
  if ("error" in parsed) return parsed;

  const { data, error } = await supabase.rpc("request_gear_items", {
    p_inventory_item_ids: itemIds,
    p_name: parsed.data.name,
    p_email: parsed.data.email,
    p_phone: parsed.data.phone,
    p_instagram_handle: parsed.data.instagramHandle,
    p_notes: parsed.data.notes,
    p_honeypot: String(formData.get("company") ?? ""),
    p_ip_address: ipAddress,
    p_delivery_method: parsed.data.deliveryMethod,
    p_shipping: parsed.data.shipping,
    p_payment_method: parsed.data.paymentMethod,
    p_as_is_acknowledged: parsed.data.asIsAcknowledged,
    p_as_is_text: asIsText,
  });

  return error ? rpcFailed(error.message) : { requestId: data as string };
}

/**
 * The linked reader's path: no contact fields at all.
 *
 * They are not sent, and not even read from the form. The cart shows this
 * reader their own name and address rather than asking for them, `people` is
 * edited through `/my/details` alone, and `gear_requests` has no contact
 * column for a per-request correction to travel on -- so a field here would be
 * input that the request then throws away.
 *
 * No honeypot either: this path costs an account and a staff-approved claim,
 * and a hidden input only catches somebody who has already been let in.
 */
async function submitAsMe(
  supabase: SupabaseClient,
  itemIds: string[],
  formData: FormData,
  options: PublicGearRequestOptions,
  ipAddress: string | null,
  asIsText: string,
): Promise<Submitted> {
  const parsed = parseGearRequestDelivery(formData, options);
  if ("error" in parsed) return parsed;

  const { data, error } = await supabase.rpc("request_gear_items_as_me", {
    p_inventory_item_ids: itemIds,
    p_notes: parsed.data.notes,
    p_ip_address: ipAddress,
    p_delivery_method: parsed.data.deliveryMethod,
    p_shipping: parsed.data.shipping,
    p_payment_method: parsed.data.paymentMethod,
    p_as_is_acknowledged: parsed.data.asIsAcknowledged,
    p_as_is_text: asIsText,
  });

  return error ? rpcFailed(error.message) : { requestId: data as string };
}
