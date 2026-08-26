"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseGearRequestForm } from "./gear-request-form";

export type RequestGearItemResult = { error: string } | { success: true };

const ERROR_MESSAGES: Record<string, string> = {
  ITEM_NOT_FOUND: "This item could not be found.",
  ITEM_ALREADY_REQUESTED:
    "Sorry, this item was just requested by someone else.",
};

// Public, unauthenticated action: anyone can request an available gear
// item. Availability is re-checked authoritatively inside the
// request_gear_item() RPC (row-locked), since the client's view of it can
// be stale and anon has no direct select/write access to inventory_items.
export async function requestGearItemAction(
  itemId: string,
  formData: FormData,
): Promise<RequestGearItemResult> {
  const parsed = parseGearRequestForm(formData);
  if ("error" in parsed) return parsed;

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("request_gear_item", {
    p_inventory_item_id: itemId,
    p_name: parsed.data.name,
    p_email: parsed.data.email,
    p_phone: parsed.data.phone,
    p_notes: parsed.data.notes,
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
