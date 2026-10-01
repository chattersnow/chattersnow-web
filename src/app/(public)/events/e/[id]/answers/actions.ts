"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getClientIp } from "@/lib/get-client-ip";
import {
  hashConfirmationToken,
  isConfirmationToken,
} from "@/lib/notifications/notification-email-token";
import {
  parseAnswersField,
  REGISTRATION_ANSWER_ERROR_MESSAGES,
} from "@/lib/registration-questions";
import {
  ANSWER_LINK_INVALID,
  ANSWER_TOKEN_FIELD,
} from "@/lib/registration-answer-requests";

export type SubmitAnswersByLinkResult =
  { error: string; linkInvalid?: boolean } | { success: true };

/**
 * Saves a registrant's answers through their emailed link (#1502).
 *
 * No session: possession of the token is the permission, and it reaches
 * exactly one registration's answers. The RPC holds them to the same rules
 * as registering, required questions included, and refuses every kind of dead
 * link with one code, so this has one sentence for all of them.
 */
export async function submitAnswersByLinkAction(
  formData: FormData,
): Promise<SubmitAnswersByLinkResult> {
  const token = String(formData.get(ANSWER_TOKEN_FIELD) ?? "");
  if (!isConfirmationToken(token)) {
    return { error: ANSWER_LINK_INVALID, linkInvalid: true };
  }

  const parsed = parseAnswersField(formData);
  if ("error" in parsed) return { error: parsed.error };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("submit_registration_answers_by_token", {
    p_token_hash: hashConfirmationToken(token),
    p_answers: parsed.answers ?? {},
    p_ip_address: await getClientIp(),
  });

  if (error) {
    if (error.message === "LINK_INVALID") {
      return { error: ANSWER_LINK_INVALID, linkInvalid: true };
    }
    if (error.message.includes("Too many")) {
      return { error: "Too many attempts. Please try again in a few minutes." };
    }
    return {
      error:
        REGISTRATION_ANSWER_ERROR_MESSAGES[error.message] ??
        "Could not save your answers. Please try again.",
    };
  }

  return { success: true };
}
