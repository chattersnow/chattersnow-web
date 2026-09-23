"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { myRegistrationClaimPath } from "@/lib/constituent/paths";
import {
  REGISTRATION_OPTION_ERROR_MESSAGES,
  type OptionCounts,
} from "@/lib/registration-options";

export type SetMyOptionCountsResult = { error: string } | { success: true };

const ERROR_MESSAGES: Record<string, string> = {
  ...REGISTRATION_OPTION_ERROR_MESSAGES,
  // One message for somebody else's registration and no record at all, as
  // the photo card does: telling them apart would be a way to test ids.
  REGISTRATION_NOT_FOUND:
    "We could not find that registration on your account.",
  NO_RECORD: "We could not find that registration on your account.",
  REGISTRATION_CLOSED:
    "Registration for this event is closed, so this can't be changed here any more. Please get in touch with us instead.",
  REGISTRATION_DEADLINE_PASSED:
    "The registration deadline has passed, so this can't be changed here any more. Please get in touch with us instead.",
};

/**
 * Changing your own answer to an event's registration question (#1407).
 * `set_my_registration_option_counts()` resolves the person itself, holds the
 * change to the same sum and caps as registering, and closes with the
 * registration window.
 */
export async function setMyOptionCountsAction(
  registrationId: string,
  counts: OptionCounts,
): Promise<SetMyOptionCountsResult> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("set_my_registration_option_counts", {
    p_registration_id: registrationId,
    p_counts: counts,
  });

  if (error) {
    return {
      error:
        ERROR_MESSAGES[error.message] ??
        "Could not save that. Please try again.",
    };
  }

  revalidatePath(myRegistrationClaimPath(registrationId));
  return { success: true };
}
