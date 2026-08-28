"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import {
  CONTACT_MESSAGE_STATUSES,
  type ContactMessageStatus,
} from "./message-types";

export type ContactMessageActionResult = { error: string } | { success: true };

export async function updateContactMessageStatusAction(
  id: string,
  status: ContactMessageStatus,
): Promise<ContactMessageActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update a message.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "communications",
    "manage",
  );
  if (permissionError) return permissionError;

  if (!(CONTACT_MESSAGE_STATUSES as readonly string[]).includes(status)) {
    return { error: "Not a valid status." };
  }

  const { error } = await supabase
    .from("contact_messages")
    .update({ status })
    .eq("id", id);

  if (error) {
    return { error: "Could not update this message. Please try again." };
  }

  revalidatePath("/portal/communications");
  return { success: true };
}
