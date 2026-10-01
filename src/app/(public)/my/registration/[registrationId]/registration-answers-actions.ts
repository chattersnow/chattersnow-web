"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { myRegistrationClaimPath } from "@/lib/constituent/paths";
import {
  REGISTRATION_ANSWER_ERROR_MESSAGES,
  type RegistrationAnswers,
} from "@/lib/registration-questions";

export type SetMyAnswersResult = { error: string } | { success: true };

const ERROR_MESSAGES: Record<string, string> = {
  ...REGISTRATION_ANSWER_ERROR_MESSAGES,
  // One message for somebody else's registration and no record at all, as
  // the options and photo cards do: telling them apart would be a way to test
  // ids.
  REGISTRATION_NOT_FOUND:
    "We could not find that registration on your account.",
  NO_RECORD: "We could not find that registration on your account.",
  REGISTRATION_CANCELLED:
    "This registration has been cancelled, so its answers can't be changed here.",
  REGISTRATION_CLOSED:
    "Registration for this event is closed, so this can't be changed here any more. Please get in touch with us instead.",
  REGISTRATION_DEADLINE_PASSED:
    "The registration deadline has passed, so this can't be changed here any more. Please get in touch with us instead.",
};

/**
 * Changing your own answers to an event's registration questions (#1501).
 * `set_my_registration_answers()` resolves the person itself, holds the answers
 * to the same rules as registering -- required questions included -- and
 * closes with the registration window. It replaces every current answer, so
 * the whole set is sent each time.
 */
export async function setMyAnswersAction(
  registrationId: string,
  answers: RegistrationAnswers,
): Promise<SetMyAnswersResult> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("set_my_registration_answers", {
    p_registration_id: registrationId,
    p_answers: answers,
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
