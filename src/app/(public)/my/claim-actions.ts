"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getClientIp } from "@/lib/get-client-ip";
import { getRequestOrigin } from "@/lib/request-origin";
import { notifyNewPersonClaim } from "@/lib/notifications/person-claim-notifications";
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

  // The form no longer prefills the Email field with the verified address
  // (#1182) -- prefilling implied that typing an address is what matches you,
  // when `person_claim_candidates()` reads the address from `auth.users` and
  // never looks at this one. But `stated_email` is also the only address that
  // lands on a record `review_person_claim()` creates from scratch, so a blank
  // field must not leave a newly enrolled person with no way to be reached.
  // Falling back to the verified address keeps exactly what was stored before.
  const statedEmail =
    String(formData.get("email") ?? "").trim() || user.email || undefined;

  const { error } = await supabase.rpc("submit_person_claim", {
    p_ip_address: await getClientIp(),
    p_name: name,
    p_email: statedEmail,
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

  // The RPC returns void on purpose -- every branch has to look the same from
  // out here -- so the id comes from reading the claim back through the
  // claimant's own select policy, which is pinned to auth.uid(). No row means
  // nothing was created (the module is off, they are already linked, or a
  // claim was already open), and so nothing to tell anyone about.
  const { data: claim } = await supabase
    .from("person_claims")
    .select("id")
    .eq("status", "pending")
    .maybeSingle();

  // Read before after(), which runs once the response is on its way and may no
  // longer have the request's headers. Only a fallback: a tenant's own domain
  // wins where it has one (#860).
  const siteUrl = await getRequestOrigin();

  if (claim) {
    // After the response, never before it (#742): telling the reviewers is the
    // organization's business, and a slow mail provider must not hold up
    // "thanks, we have your request".
    after(async () => {
      await notifyNewPersonClaim(createSupabaseAdminClient(), {
        claimId: claim.id,
        siteUrl,
      });
    });
  }

  revalidatePath(MY_PATH_PREFIX);
  return { submitted: true };
}
