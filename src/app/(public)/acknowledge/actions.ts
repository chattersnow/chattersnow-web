"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getClientIp } from "@/lib/get-client-ip";
import {
  hashConfirmationToken,
  isConfirmationToken,
} from "@/lib/notifications/notification-email-token";
import { gearAsIsText } from "@/lib/gear-as-is";
import { getPublicLexicon } from "@/lib/lexicon";
import {
  ACKNOWLEDGEMENT_ERROR_MESSAGES,
  ACKNOWLEDGEMENT_LINK_INVALID,
} from "@/lib/distribution-acknowledgement";

/**
 * The recipient acknowledging a handout as-is on their own phone (#1519).
 *
 * No session: holding the one-time code is the permission, and it reaches
 * exactly one open handout. The words stored are this tenant's, resolved here
 * from `src/lib/gear-as-is.ts` -- never sent by the browser.
 */
export async function acknowledgeHandoutAction(
  token: string,
  input: { typedName: string; acknowledged: boolean },
): Promise<{ success: true } | { error: string }> {
  if (!isConfirmationToken(token)) {
    return { error: ACKNOWLEDGEMENT_LINK_INVALID };
  }

  const supabase = await createSupabaseServerClient();
  const lexicon = await getPublicLexicon(supabase);
  const { error } = await supabase.rpc("acknowledge_distribution_by_token", {
    p_token_hash: hashConfirmationToken(token),
    p_acknowledged: input.acknowledged,
    p_typed_name: input.typedName,
    p_as_is_text: gearAsIsText(lexicon),
    p_ip_address: await getClientIp(),
  });

  if (error) {
    if (error.message === "LINK_INVALID") {
      return { error: ACKNOWLEDGEMENT_LINK_INVALID };
    }
    if (error.message.includes("Too many")) {
      return { error: "Too many attempts. Please try again in a few minutes." };
    }
    return {
      error:
        ACKNOWLEDGEMENT_ERROR_MESSAGES[error.message] ??
        "Could not save that. Please try again.",
    };
  }
  return { success: true };
}
