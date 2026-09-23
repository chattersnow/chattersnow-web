import { MINOR_CONTACTS_REQUIRED_CODE } from "@/lib/minors";
import { REGISTRATION_OPTION_ERROR_CODES } from "@/lib/registration-options";

/**
 * The three steps of a registration form (#1413), at every width: the
 * questions about the registrant, the questions about this attendance, then a
 * summary of both beside the notices, the agreement and the button.
 *
 * A plain module rather than part of `registration-steps.tsx`, because the
 * server actions need the codes below and a `"use client"` module would hand
 * them a client reference instead of the value.
 */
export type RegistrationStep = "about" | "event" | "review";

export const REGISTRATION_STEPS: readonly RegistrationStep[] = [
  "about",
  "event",
  "review",
];

/** RPC error codes about something typed on "About you". */
const ABOUT_ERROR_CODES = new Set([
  "ALREADY_REGISTERED",
  "NAME_REQUIRED",
  "PRONOUNS_TOO_LONG",
]);

/** RPC error codes about something typed on "This event" ("Your riding"). */
const EVENT_ERROR_CODES = new Set([
  "INVALID_PARTY_SIZE",
  MINOR_CONTACTS_REQUIRED_CODE,
  // #1407. The question sits beside the party size, and a full option is
  // corrected there too.
  ...REGISTRATION_OPTION_ERROR_CODES,
  // #1415. The riding questions are asked on this step.
  "INVALID_RIDER_PROFILE",
]);

/**
 * The step that owns an RPC error. Anything not about a typed field --
 * capacity, a closed window, the agreement -- is shown on the step the button
 * is on, since there is nothing further back to correct.
 */
export function registrationErrorStep(code: string): RegistrationStep {
  if (ABOUT_ERROR_CODES.has(code)) return "about";
  if (EVENT_ERROR_CODES.has(code)) return "event";
  return "review";
}

/**
 * The form fields `parseEventRegistrationForm` can refuse that belong to
 * "This event". Every other field it checks is on "About you".
 */
const EVENT_FIELDS = new Set([
  "partySize",
  "partyIncludesMinor",
  "minorContacts",
  "riding",
]);

/** The step that owns a field the form parser refused. */
export function registrationFieldStep(field?: string): RegistrationStep {
  return field && EVENT_FIELDS.has(field) ? "event" : "about";
}
