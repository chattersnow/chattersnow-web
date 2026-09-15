"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getClientIp } from "@/lib/get-client-ip";
import { MY_PATH_PREFIX } from "@/lib/constituent/paths";

export type ClaimActionResult = { error: string } | { submitted: true };

/**
 * Ask to be linked to a directory record (#1162).
 *
 * The result is the same object whatever happened underneath: matched a donor,
 * matched nobody, already had a claim open, or the tenant has the module off.
 * `submit_person_claim()` is silent by design for that reason, and this must
 * not undo it by reporting anything the RPC declined to say -- "we already
 * have a record for this address" answers "is this person a donor here?" for
 * anyone who asks, and a form is a comfortable place to ask it repeatedly.
 *
 * The only failure this reports is a failure of the request itself: not signed
 * in, or the database refused to talk to us. Neither says anything about who
 * is in the directory.
 */
export async function submitClaimAction(
  formData: FormData,
): Promise<ClaimActionResult> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { error: "Tell us the name we would have you under." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Please sign in again." };
  }

  const { error } = await supabase.rpc("submit_person_claim", {
    p_ip_address: await getClientIp(),
    p_name: name,
    p_email: String(formData.get("email") ?? "").trim() || undefined,
    p_phone: String(formData.get("phone") ?? "").trim() || undefined,
    p_instagram_handle:
      String(formData.get("instagram") ?? "").trim() || undefined,
    p_note: String(formData.get("note") ?? "").trim() || undefined,
  });

  if (error) {
    // The one thing the RPC says out loud, and the only thing it safely can:
    // that this caller is going too fast. Every other branch is silent, so
    // there is exactly one message to translate here.
    if (error.message.includes("RATE_LIMITED")) {
      return {
        error: "Too many requests just now. Try again in a little while.",
      };
    }
    return { error: "We could not send that just now. Please try again." };
  }

  revalidatePath(MY_PATH_PREFIX);
  return { submitted: true };
}
