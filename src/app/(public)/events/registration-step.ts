import { MINOR_CONTACTS_REQUIRED_CODE } from "@/lib/minors";

/**
 * The two halves of a registration form (#1403): the questions about the
 * registrant and their party, then the notices and the agreement that sit
 * beside the button. On a phone they are two steps; on a wider screen, one
 * page under two headings.
 *
 * A plain module rather than part of `registration-steps.tsx`, because the
 * server actions need the codes below and a `"use client"` module would hand
 * them a client reference instead of the value.
 */
export type RegistrationStep = "details" | "confirm";

/**
 * RPC error codes that are about something typed on the first step. Anything
 * else -- capacity, a closed window, the agreement -- is shown on the step the
 * button is on, since there is nothing further back to correct.
 */
const DETAILS_ERROR_CODES = new Set([
  "ALREADY_REGISTERED",
  "NAME_REQUIRED",
  "INVALID_PARTY_SIZE",
  "PRONOUNS_TOO_LONG",
  MINOR_CONTACTS_REQUIRED_CODE,
]);

export function registrationErrorStep(code: string): RegistrationStep {
  return DETAILS_ERROR_CODES.has(code) ? "details" : "confirm";
}
