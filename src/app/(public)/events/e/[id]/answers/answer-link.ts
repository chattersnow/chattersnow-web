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
import type { RegistrationContact } from "@/lib/registration-contact";
import {
  toRegistrantCarpool,
  type RegistrantCarpool,
} from "@/lib/carpool-assignment";

/** What a live answers link opens (#1502). Nothing about the registrant but a first name. */
export type AnswerLink = {
  eventId: string;
  eventName: string;
  firstName: string | null;
  expiresAt: string;
  questions: RegistrationQuestion[];
  /** The raw stored values, keyed as `answerRowsToAnswers()` reads them. */
  answerRows: { question_id: string; value: unknown }[];
  /**
   * The handle or no-Instagram contact on file (#1647), or null where the
   * organization does not require one. Never carries the detail: the RPC
   * leaves the number or address out, so a forwarded link cannot show it.
   */
  contact: RegistrationContact | null;
  /**
   * The registrant's car on an event that organizes carpools (#1651), with
   * `car` null until they are placed in one; null on every other event.
   */
  carpool: RegistrantCarpool | null;
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
  contact: {
    instagram_handle: string | null;
    has_no_instagram: boolean | null;
    preferred_contact_method: string | null;
  } | null;
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
  const tokenHash = hashConfirmationToken(token);
  const ipAddress = await getClientIp();
  const [{ data, error }, carpool] = await Promise.all([
    supabase.rpc("get_registration_answer_request", {
      p_token_hash: tokenHash,
      p_ip_address: ipAddress,
    }),
    // #1651. Its own read, refused for the same tokens; a failure here only
    // costs the page its carpool card.
    supabase.rpc("registration_carpool_by_token", {
      p_token_hash: tokenHash,
      p_ip_address: ipAddress,
    }),
  ]);

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
      contact: raw.contact
        ? { ...raw.contact, preferred_contact_detail: null }
        : null,
      carpool: carpool.error ? null : toRegistrantCarpool(carpool.data),
    },
  };
}
