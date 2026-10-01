import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getClientIp } from "@/lib/get-client-ip";
import {
  hashConfirmationToken,
  isConfirmationToken,
} from "@/lib/notifications/notification-email-token";
import {
  toRegistrationQuestion,
  type RegistrationQuestion,
} from "@/lib/registration-questions";

/** What a live answers link opens (#1502). Nothing about the registrant but a first name. */
export type AnswerLink = {
  eventId: string;
  eventName: string;
  firstName: string | null;
  expiresAt: string;
  questions: RegistrationQuestion[];
  /** The raw stored values, keyed as `answerRowsToAnswers()` reads them. */
  answerRows: { question_id: string; value: unknown }[];
};

export type AnswerLinkLookup =
  { link: AnswerLink } | { error: "invalid" | "rate_limited" };

type RawLink = {
  event_id: string;
  event_name: string;
  first_name: string | null;
  expires_at: string;
  questions: (Parameters<typeof toRegistrationQuestion>[0] & {
    question_id: string;
    value: unknown;
  })[];
};

/**
 * Resolves a token from an emailed link, for both the page and its action.
 *
 * Shape-checked before it is hashed, so a stray query parameter never becomes
 * a database lookup. Every refusal the RPC makes -- unknown, expired,
 * superseded, cancelled, another tenant's -- comes back as one `invalid`, as
 * does a live link opened under a different event's URL.
 */
export async function lookUpAnswerLink(
  token: string,
  eventId: string,
): Promise<AnswerLinkLookup> {
  if (!isConfirmationToken(token)) return { error: "invalid" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(
    "get_registration_answer_request",
    {
      p_token_hash: hashConfirmationToken(token),
      p_ip_address: await getClientIp(),
    },
  );

  if (error) {
    return {
      error: error.message.includes("Too many") ? "rate_limited" : "invalid",
    };
  }
  const raw = data as RawLink | null;
  if (!raw || raw.event_id !== eventId) return { error: "invalid" };

  return {
    link: {
      eventId: raw.event_id,
      eventName: raw.event_name,
      firstName: raw.first_name,
      expiresAt: raw.expires_at,
      questions: (raw.questions ?? []).flatMap((row) => {
        const question = toRegistrationQuestion(row);
        return question ? [question] : [];
      }),
      answerRows: (raw.questions ?? []).map((row) => ({
        question_id: row.question_id,
        value: row.value,
      })),
    },
  };
}
