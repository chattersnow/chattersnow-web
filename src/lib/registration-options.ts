/**
 * Per-event registration options (#1407): one single-choice question an event
 * can ask, answered per person as counts that add up to the party size. The
 * platform knows nothing about what the options mean -- "need a lift ticket"
 * is Chatter Snow's, "need a mat" somebody else's.
 *
 * `register_for_event()`, `register_myself_for_event()` and the two `set_*`
 * functions are the authority on every rule here; the checks in this module
 * only let a form say what is wrong before the round trip.
 */

/** One choice as a form shows it. */
export type RegistrationOption = {
  id: string;
  label: string;
  /** Closed to new claims. The public form disables it. */
  isFull: boolean;
  /**
   * The most this registration may hold, where the reader is editing an
   * answer they already gave. Null is uncapped; absent means "use isFull".
   */
  available?: number | null;
};

export type RegistrationOptionsQuestion = {
  prompt: string;
  options: RegistrationOption[];
};

/** Option id -> how many people in the party chose it. */
export type OptionCounts = Record<string, number>;

/** A stored answer, as the portal and the confirmation email read it. */
export type OptionCountRow = {
  option_id: string | null;
  label: string;
  quantity: number;
  sort_order: number;
};

export const OPTION_COUNT_FIELD_PREFIX = "optionCount.";

export const REGISTRATION_OPTION_ERROR_MESSAGES: Record<string, string> = {
  EVENT_OPTIONS_REQUIRED: "Please say what each person in your party needs.",
  EVENT_OPTIONS_MISMATCH:
    "The numbers you chose need to add up to the number attending.",
  EVENT_OPTIONS_INVALID:
    "One of the options has changed since the page loaded. Reload the page and try again.",
  EVENT_OPTION_FULL:
    "One of the options you chose has just filled up. Please pick another.",
};

/** Codes that are about something typed on the form's first step (#1403). */
export const REGISTRATION_OPTION_ERROR_CODES = Object.keys(
  REGISTRATION_OPTION_ERROR_MESSAGES,
);

/** The same message a form shows before the RPC would raise the mismatch. */
export function optionCountsError(
  counts: OptionCounts,
  partySize: number,
): string | null {
  const total = totalOptionCount(counts);
  if (total === 0)
    return REGISTRATION_OPTION_ERROR_MESSAGES.EVENT_OPTIONS_REQUIRED;
  if (total !== partySize) {
    return REGISTRATION_OPTION_ERROR_MESSAGES.EVENT_OPTIONS_MISMATCH;
  }
  return null;
}

export function totalOptionCount(counts: OptionCounts): number {
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}

/** Writes an answer into FormData, one field per option. */
export function setOptionCounts(formData: FormData, counts: OptionCounts) {
  for (const [optionId, count] of Object.entries(counts)) {
    formData.set(`${OPTION_COUNT_FIELD_PREFIX}${optionId}`, String(count));
  }
}

/**
 * Reads an answer back out of FormData. Null when no option fields were sent
 * -- an event with no question, or a caller that did not answer -- which is
 * what the RPC reads as "no answer". A value that is not a whole number of 0
 * or more is sent as-is for the RPC to refuse, rather than silently dropped.
 */
export function parseOptionCounts(formData: FormData): OptionCounts | null {
  const counts: OptionCounts = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith(OPTION_COUNT_FIELD_PREFIX)) continue;
    const raw = String(value).trim();
    counts[key.slice(OPTION_COUNT_FIELD_PREFIX.length)] =
      raw === "" ? 0 : Number(raw);
  }
  return Object.keys(counts).length > 0 ? counts : null;
}

/** Whether any count is positive -- staff may leave the question unanswered. */
export function hasOptionAnswer(counts: OptionCounts | null | undefined) {
  return counts ? totalOptionCount(counts) > 0 : false;
}

/** "2 × I need a ticket, 1 × I'll use my own", in the event's own order. */
export function formatOptionCounts(rows: OptionCountRow[]): string {
  return [...rows]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((row) => `${row.quantity} × ${row.label}`)
    .join(", ");
}
