/**
 * Asking registrants to complete an event's registration questions by emailed
 * link (#1502): who is asked, what the registrants tab says about it, and the
 * words the request goes out in.
 *
 * No runtime imports beyond siblings of the same kind, like
 * `@/lib/event-announcements`: the dialog that counts the recipients before a
 * staffer commits is a client component and the action that resolves them for
 * real is on the server. Both have to agree exactly, so the rule lives here
 * once.
 */

import { MAX_ANNOUNCEMENT_RECIPIENTS } from "@/lib/event-announcements";
import { REGISTRATION_ANSWERS_REQUEST_KIND } from "@/lib/outbound-messages";
import {
  answerRowsToAnswers,
  missingRequiredQuestions,
  type RegistrationQuestion,
} from "@/lib/registration-questions";

/**
 * The most registrants one send may reach. The announcement cap, for the
 * announcement's reason: one Resend account with a daily allowance shared by
 * every tenant. Unlike an announcement the send is not refused past it --
 * the first this-many are asked, and the "recently asked" guard below means
 * sending again tomorrow picks up the rest.
 */
export const MAX_ANSWER_REQUEST_RECIPIENTS = MAX_ANNOUNCEMENT_RECIPIENTS;

/**
 * How long a request counts as recent. The bulk send skips anyone asked inside
 * it unless the staffer says otherwise, so a second click, or a second
 * organizer, does not mail the same people twice in a day.
 */
export const RECENTLY_ASKED_MS = 24 * 60 * 60 * 1000;

/** The part of a registration's request the portal reads. */
export type AnswerRequestStatus = {
  requested_at: string;
  answered_at: string | null;
};

/** What the registrants tab says beside a name, or null for nothing. */
export type AnswerRequestState =
  { state: "answered"; at: string } | { state: "asked"; at: string };

/**
 * "Answered" once answers have been saved through a link since it was last
 * sent; "Asked" while the latest link is still waiting. A link sent again
 * after an answer reads as asked, because that is what it is.
 */
export function answerRequestState(
  request: AnswerRequestStatus | null,
): AnswerRequestState | null {
  if (!request) return null;
  if (
    request.answered_at &&
    Date.parse(request.answered_at) >= Date.parse(request.requested_at)
  ) {
    return { state: "answered", at: request.answered_at };
  }
  return { state: "asked", at: request.requested_at };
}

export function wasAskedRecently(
  request: AnswerRequestStatus | null,
  now: number = Date.now(),
): boolean {
  if (!request) return false;
  return now - Date.parse(request.requested_at) < RECENTLY_ASKED_MS;
}

/** The part of a registration that decides whether it is asked. */
export type AnswerRequestCandidate = {
  id: string;
  name: string;
  email: string | null;
  person_id: string | null;
  answers: readonly { question_id: string | null; value: unknown }[];
  answer_request: AnswerRequestStatus | null;
};

export type AnswerRequestRecipient = {
  registrationId: string;
  name: string;
  email: string;
  personId: string | null;
};

export type ResolvedAnswerRequests = {
  /** Who this send mails, in the order they registered, capped. */
  recipients: AnswerRequestRecipient[];
  /** Missing an answer, with an address, but past the cap: next time. */
  overCap: number;
  /** Missing an answer but with no address to write to. */
  withoutAddress: number;
  /** Missing an answer but asked inside RECENTLY_ASKED_MS, and left out. */
  recentlyAsked: number;
};

/**
 * Who a bulk request reaches: every active registration still missing a
 * required answer it was shown, with an address, not asked in the last day
 * unless `includeRecent`, up to the cap.
 *
 * Unlike an announcement, a repeated address is NOT collapsed. Each link opens
 * one registration's answers, so somebody who registered twice -- once for
 * themselves, once for a friend -- needs both.
 */
export function resolveAnswerRequests(
  registrations: readonly AnswerRequestCandidate[],
  questions: readonly RegistrationQuestion[],
  options: { includeRecent: boolean; now?: number },
): ResolvedAnswerRequests {
  const now = options.now ?? Date.now();
  const resolved: ResolvedAnswerRequests = {
    recipients: [],
    overCap: 0,
    withoutAddress: 0,
    recentlyAsked: 0,
  };

  for (const registration of registrations) {
    const missing = missingRequiredQuestions(
      questions,
      answerRowsToAnswers(registration.answers),
    );
    if (missing.length === 0) continue;

    const email = (registration.email ?? "").trim();
    if (!email) {
      resolved.withoutAddress += 1;
      continue;
    }
    if (
      !options.includeRecent &&
      wasAskedRecently(registration.answer_request, now)
    ) {
      resolved.recentlyAsked += 1;
      continue;
    }
    if (resolved.recipients.length >= MAX_ANSWER_REQUEST_RECIPIENTS) {
      resolved.overCap += 1;
      continue;
    }
    resolved.recipients.push({
      registrationId: registration.id,
      name: registration.name.trim(),
      email,
      personId: registration.person_id,
    });
  }

  return resolved;
}

/** The sentence the dialog shows before the send. */
export function describeAnswerRequests(
  resolved: ResolvedAnswerRequests,
): string {
  const count = resolved.recipients.length;
  const head =
    count === 0
      ? "This will email nobody"
      : `This will email ${count} ${count === 1 ? "registrant" : "registrants"} missing a required answer`;

  const notes: string[] = [];
  if (resolved.overCap > 0) {
    notes.push(
      `${resolved.overCap} more can be asked tomorrow — ${MAX_ANSWER_REQUEST_RECIPIENTS} is the most one send reaches`,
    );
  }
  if (resolved.recentlyAsked > 0) {
    notes.push(
      `${resolved.recentlyAsked} ${resolved.recentlyAsked === 1 ? "was" : "were"} asked in the last 24 hours`,
    );
  }
  if (resolved.withoutAddress > 0) {
    notes.push(
      `${resolved.withoutAddress} ${resolved.withoutAddress === 1 ? "has" : "have"} no email address`,
    );
  }

  return notes.length > 0 ? `${head}; ${notes.join("; ")}.` : `${head}.`;
}

/**
 * Per registration and per send, for the reasons `eventAnnouncementDedupeKey`
 * gives: a null `person_id` would dedupe against nothing under a shared key,
 * and the registration id has to appear in the key for the delivery log to
 * find it from the record.
 */
export function registrationAnswersRequestDedupeKey(
  registrationId: string,
  batchId: string,
): string {
  return `${REGISTRATION_ANSWERS_REQUEST_KIND}:${registrationId}:${batchId}`;
}

export function answersRequestSubject(eventName: string): string {
  const name = eventName.trim();
  return name
    ? `A few questions about ${name}`
    : "A few questions about your registration";
}

/** What the editable paragraph above the link starts as. */
export function defaultAnswersRequestIntro(eventName: string): string {
  const name = eventName.trim() || "the event";
  return `We've added a few questions to ${name} since you registered. Could you take a minute to answer them? It helps us plan the day.`;
}

export const MAX_ANSWERS_REQUEST_INTRO_LENGTH = 1000;

export const ANSWER_REQUEST_ERRORS = {
  NO_QUESTIONS: "This event asks no registration questions.",
  NO_RECIPIENTS:
    "Nobody is missing a required answer with an address to write to, so there is nothing to send.",
  INTRO_EMPTY: "Write a sentence or two to go above the link.",
  INTRO_TOO_LONG: `Keep the message to ${MAX_ANSWERS_REQUEST_INTRO_LENGTH} characters or fewer.`,
  EVENT_ENDED:
    "This event has ended, so a link would already have expired. Nothing was sent.",
  FAILED: "The request could not be sent. Please try again.",
} as const;

/** The one message every dead link shows, whichever way it died. */
export const ANSWER_LINK_INVALID =
  "This link no longer works. It may have expired or been replaced by a newer one. Please contact us if you still need to answer.";

/**
 * The form field the token travels in on the answers page. The page renders it
 * into its form rather than into any link, so it leaves only with the save.
 */
export const ANSWER_TOKEN_FIELD = "t";
