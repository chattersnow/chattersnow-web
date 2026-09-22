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
  // The control only ever sends true or false, so nothing in the interface can
  // reach this. Kept as a last line: null is "no objection on record", and
  // writing it back would erase the record of having objected.
  PHOTO_CONSENT_REQUIRED:
    "We could not save that. Tell any organizer at the event, or email us, and we will put it on the record.",
};

/**
 * Recording or withdrawing an objection to being photographed (#599, #1376).
 *
 * `false` records the objection and `true` withdraws it. Null is refused by
 * the RPC, because null means "no objection on record" and writing it back
 * would erase the record of having objected — the one thing the three states
 * exist to keep straight.
 *
 * **This is the self-service route and the narrowest of the three.** It
 * reaches whoever has claimed an account, and only their own rows —
 * `set_my_photo_consent()` resolves the person itself through
 * `my_constituent_person_id('events')`, so whose record is written is never
 * the caller's to choose. Most registrants have never claimed an account,
 * which is why the registration form names an organizer and email first and
 * qualifies this one rather than promising it.
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
        "Could not save that. Please try again.",
    };
  }

  revalidatePath(myRegistrationClaimPath(registrationId));
  return { success: true, consent };
}
