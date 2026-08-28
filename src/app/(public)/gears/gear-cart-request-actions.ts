"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getClientIp } from "@/lib/get-client-ip";
import { parseGearRequestForm } from "./gear-request-form";

export type RequestGearItemsResult = { error: string } | { success: true };

const ERROR_MESSAGES: Record<string, string> = {
  NO_ITEMS: "Add at least one item to your cart before submitting.",
  ITEM_NOT_FOUND: "One of the items in your cart could not be found.",
  ITEM_ALREADY_REQUESTED:
    "Sorry, one of the items in your cart was just requested by someone else. Remove it and try again.",
  RATE_LIMITED: "Too many attempts — please try again in a few minutes.",
};

// Public, unauthenticated action backing the gear library cart (#247):
// submits every selected item as one combined request. Availability is
// re-checked authoritatively inside the request_gear_items() RPC (each item
// row-locked, all-or-nothing), since the client's view of the cart can be
// stale and anon has no direct select/write access to inventory_items.
export async function requestGearItemsAction(
  itemIds: string[],
  formData: FormData,
): Promise<RequestGearItemsResult> {
  if (itemIds.length === 0) return { error: ERROR_MESSAGES.NO_ITEMS };

  const parsed = parseGearRequestForm(formData);
  if ("error" in parsed) return parsed;

  const honeypot = String(formData.get("company") ?? "");
  const ipAddress = await getClientIp();

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("request_gear_items", {
    p_inventory_item_ids: itemIds,
    p_name: parsed.data.name,
    p_email: parsed.data.email,
    p_phone: parsed.data.phone,
    p_notes: parsed.data.notes,
    p_honeypot: honeypot,
    p_ip_address: ipAddress,
  });

  if (error) {
    return {
      error:
        ERROR_MESSAGES[error.message] ??
        "Could not submit your request. Please try again.",
    };
  }

  revalidatePath("/gears/library");
  revalidatePath("/portal/inventory/items");
  return { success: true };
}
