/**
 * Adults only (18+), a per-event setting (#1417).
 *
 * On, the public site shows an 18+ badge, registration's step 2 asks every
 * registrant to confirm that everyone in their party is 18 or over, and the
 * under-18 question (#685, #1416) is never asked. The RPC refuses a
 * registration without the confirmation and records when it was given, so
 * the form's checkbox is a convenience and never the gate.
 */

/** The badge's text, on the card, the detail page and the sheet header. */
export const ADULTS_ONLY_BADGE = "18+";

/** What the badge means, for a screen reader and a tooltip. */
export const ADULTS_ONLY_DESCRIPTION =
  "Adults only: everyone must be 18 or over";

/** The checkbox's label, worded once so the two registration forms agree. */
export const ADULTS_ONLY_CONFIRMATION_LABEL =
  "Everyone in my party is 18 or over";

/** The form field the confirmation posts as. */
export const ADULTS_ONLY_CONFIRMED_FIELD = "adultsOnlyConfirmed";

/** What the RPC raises without the confirmation. */
export const ADULTS_ONLY_CONFIRMATION_REQUIRED_CODE =
  "ADULTS_ONLY_CONFIRMATION_REQUIRED";

export const ADULTS_ONLY_CONFIRMATION_REQUIRED_ERROR =
  "This event is for adults only. Please confirm everyone in your party is 18 or over.";

/** Whether the form's box was ticked. Anything but "on" is not a confirmation. */
export function parseAdultsOnlyConfirmed(formData: FormData): boolean {
  return formData.get(ADULTS_ONLY_CONFIRMED_FIELD) === "on";
}
