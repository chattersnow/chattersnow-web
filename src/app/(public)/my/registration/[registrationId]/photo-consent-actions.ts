"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  PHOTO_CONSENT_UNAVAILABLE_CODE,
  PHOTO_CONSENT_UNAVAILABLE_ERROR,
} from "@/lib/photo-consent";
import { myRegistrationClaimPath } from "@/lib/constituent/paths";

export type SetMyPhotoConsentResult =
  { error: string } | { success: true; consent: boolean };

const ERROR_MESSAGES: Record<string, string> = {
  // Somebody else's registration, an id that names nothing, or a reader whose
  // claim has not been approved. One message for all three, deliberately: a
  // page that distinguished them would be a way to test registration ids.
  REGISTRATION_NOT_FOUND:
    "We could not find that registration on your account.",
  NO_RECORD: "We could not find that registration on your account.",
  [PHOTO_CONSENT_UNAVAILABLE_CODE]: PHOTO_CONSENT_UNAVAILABLE_ERROR,
  // The control only sends true or false, so this is a hand-crafted post.
  PHOTO_CONSENT_REQUIRED: "Please choose yes or no.",
};

/**
 * Changing your mind about being photographed (#599).
 *
 * **A consent that cannot be withdrawn is not consent**, which is the
 * substantive difference from the participant waiver: an acceptance records an
 * act that happened and stands, and this records a permission that is either
 * still given or is not. `/terms` already promises a takedown route by email;
 * this is the one that does not depend on somebody reading a mailbox.
 *
 * It reaches whoever has claimed an account, and only their own rows —
 * `set_my_photo_consent()` resolves the person itself through
 * `my_constituent_person_id('events')`, so whose answer is written is never
 * the caller's to choose. An anonymous registrant still has the email route
 * and nothing here takes it away.
 */
export async function setMyPhotoConsentAction(
  registrationId: string,
  consent: boolean,
): Promise<SetMyPhotoConsentResult> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("set_my_photo_consent", {
    p_registration_id: registrationId,
    p_consent: consent,
  });

  if (error) {
    return {
      error:
        ERROR_MESSAGES[error.message] ??
        "Could not save your answer. Please try again.",
    };
  }

  revalidatePath(myRegistrationClaimPath(registrationId));
  return { success: true, consent };
}
