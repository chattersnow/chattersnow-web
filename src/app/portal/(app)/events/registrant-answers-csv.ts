/**
 * The registrants tab's "Download answers (CSV)" (#1501), as a pure function
 * so what lands in the file can be tested without a database. The route
 * handler beside the event page does the reading and the permission check.
 *
 * Contact details are the point of care here. Registering never implies
 * sharing (#1318, docs/legal-basis.md): an event's consent question marked
 * `shares_contact` is the only thing that puts a registrant's email and phone
 * into this file, and only on the rows that ticked it. An event with no such
 * question has no Email or Phone columns at all, so a file made for a partner
 * cannot carry them by accident.
 *
 * The Instagram handle is the exception, by the organization's choice: it is a
 * public handle the registrant gave so the organization can tag and find them,
 * and the export carries it on every row that has one, consent or not.
 *
 * Rider answers -- how a registrant rides and at what level -- are not
 * contact details, so they are not under that consent. They appear for a
 * reader cleared for them (`rider_profiles`, which carries the rider_profile
 * module, #1408) and are read the way the Rides column reads them.
 */

import {
  experienceLevelLabel,
  ridingDisciplineLabel,
} from "@/lib/rider-profile";
import { effectiveRider, type RiderAnswers } from "./rider-stats";

export type AnswersCsvQuestion = {
  id: string;
  prompt: string;
  shares_contact: boolean;
};

export type AnswersCsvRegistration = {
  name: string;
  party_size: number;
  email: string | null;
  phone: string | null;
  instagram_handle: string | null;
  /** Only read when the file is built with `riders`. */
  rider?: RiderAnswers | null;
  answers: {
    question_id: string | null;
    answer_text: string;
    value: unknown;
  }[];
};

/**
 * Whether this registration agreed to its contact details being shared: it
 * ticked a `shares_contact` question and declined none. Unanswered is not
 * agreement -- that is a registration from before the question existed, or a
 * walk-in nobody asked.
 */
export function sharesContact(
  questions: readonly AnswersCsvQuestion[],
  registration: AnswersCsvRegistration,
): boolean {
  const consentIds = new Set(
    questions
      .filter((question) => question.shares_contact)
      .map((question) => question.id),
  );
  const consents = registration.answers.filter(
    (answer) => answer.question_id && consentIds.has(answer.question_id),
  );
  return (
    consents.length > 0 && consents.every((answer) => answer.value === true)
  );
}

/**
 * One field, quoted where it has to be (RFC 4180), and with a leading `=`,
 * `+`, `-`, `@`, tab or carriage return neutralised by a `'` so a spreadsheet
 * opens it as text rather than running it as a formula. The answers are free
 * text typed by the public.
 */
export function csvField(value: string | number | null): string {
  if (value === null) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * Name, party size, one column per current question in the event's order
 * (each its answer in words, blank where unanswered), then Rides, Ski level
 * and Snowboard level with `riders`, then Instagram on every row, then Email
 * and Phone only where the event has a `shares_contact` question -- filled
 * only on the rows that agreed. CRLF line endings, as RFC 4180 and Excel
 * expect.
 */
export function registrantAnswersCsv(
  questions: readonly AnswersCsvQuestion[],
  registrations: readonly AnswersCsvRegistration[],
  { riders = false }: { riders?: boolean } = {},
): string {
  const withContact = questions.some((question) => question.shares_contact);
  const header = [
    "Name",
    "Party size",
    ...questions.map((question) => question.prompt),
    ...(riders ? ["Rides", "Ski level", "Snowboard level"] : []),
    "Instagram",
    ...(withContact ? ["Email", "Phone"] : []),
  ];

  const rows = registrations.map((registration) => {
    const byQuestion = new Map(
      registration.answers.map((answer) => [
        answer.question_id,
        answer.answer_text,
      ]),
    );
    const shares = withContact && sharesContact(questions, registration);
    const rider =
      riders && registration.rider ? effectiveRider(registration.rider) : null;
    return [
      registration.name,
      registration.party_size,
      ...questions.map((question) => byQuestion.get(question.id) ?? null),
      ...(riders
        ? [
            ridingDisciplineLabel(rider?.discipline ?? null),
            experienceLevelLabel(rider?.ski ?? null),
            experienceLevelLabel(rider?.snowboard ?? null),
          ]
        : []),
      // Bare, as stored: an `@` prefix would come out as `'@` from
      // csvField's formula guard.
      registration.instagram_handle || null,
      ...(withContact
        ? [
            shares ? registration.email || null : null,
            shares ? registration.phone || null : null,
          ]
        : []),
    ];
  });

  return [header, ...rows]
    .map((row) => row.map(csvField).join(","))
    .join("\r\n")
    .concat("\r\n");
}

/** `spring-social-answers-2026-10-01.csv`; ASCII only, for the header. */
export function registrantAnswersCsvFilename(
  eventName: string,
  date: string,
): string {
  const slug = eventName
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "event"}-answers-${date}.csv`;
}
