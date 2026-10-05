/**
 * The recipient's own as-is acknowledgement at an in-person handout (#1519).
 *
 * #1367 took the acknowledgement on the public gear request and left gear
 * handed out in person with nothing, because a box in the portal would be
 * staff attesting on the recipient's behalf. The checkout asks the recipient
 * instead: on their own phone, through a one-time QR code that belongs to the
 * handout (never to an item -- an item tag only ever opens the staff
 * resolver), or on the staff device handed to them. Where neither happens,
 * staff record it only with one of the reasons below.
 */

/** Why a handout was recorded without the recipient's acknowledgement. */
export const SKIPPED_REASONS = [
  "left_before_acknowledging",
  "no_phone",
  "declined_to_wait",
  "other",
] as const;

export type SkippedReason = (typeof SKIPPED_REASONS)[number];

export const SKIPPED_REASON_LABELS: Record<SkippedReason, string> = {
  left_before_acknowledging: "Left before acknowledging",
  no_phone: "No phone",
  declined_to_wait: "Declined to wait",
  other: "Other",
};

export function isSkippedReason(value: unknown): value is SkippedReason {
  return (
    typeof value === "string" &&
    (SKIPPED_REASONS as readonly string[]).includes(value)
  );
}

/** How an acknowledgement was taken. `gear_request` and the request methods
 *  are read off the request the handout fulfilled. */
export type AcknowledgementMethod =
  | "own_device"
  | "staff_device"
  | "emailed_link"
  | "gear_request"
  | "request_form"
  | "in_person";

const METHOD_PHRASES: Record<AcknowledgementMethod, string> = {
  own_device: "on their own phone",
  staff_device: "on a staff device",
  emailed_link: "by emailed link",
  gear_request: "on their request",
  request_form: "on the request form",
  in_person: "in person at the handout",
};

/** "on their own phone", for "Acknowledged as-is by Jane Doe on their own
 *  phone". Unknown values read as nothing rather than as a raw key. */
export function acknowledgementMethodPhrase(
  method: string | null | undefined,
): string {
  return method && method in METHOD_PHRASES
    ? METHOD_PHRASES[method as AcknowledgementMethod]
    : "";
}

/** One line for an acknowledgement or the reason there is none. */
export function describeAcknowledgement(entry: {
  acknowledgedAt: string | null;
  typedName: string | null;
  method: string | null;
  skippedReason: string | null;
  skippedNote: string | null;
}): string | null {
  if (entry.acknowledgedAt) {
    const by = entry.typedName ? ` by ${entry.typedName}` : "";
    const how = acknowledgementMethodPhrase(entry.method);
    return `Acknowledged as-is${by}${how ? ` ${how}` : ""}`;
  }
  if (entry.skippedReason) {
    const reason = isSkippedReason(entry.skippedReason)
      ? SKIPPED_REASON_LABELS[entry.skippedReason]
      : entry.skippedReason;
    return `Not acknowledged: ${reason.toLowerCase()}${
      entry.skippedNote ? ` — ${entry.skippedNote}` : ""
    }`;
  }
  return null;
}

/** The query parameter the token rides in, and the form field it is posted
 *  back in. */
export const ACKNOWLEDGEMENT_TOKEN_FIELD = "t";

/** Where the one-time QR code lands, on the tenant's public site. */
export function acknowledgementPath(token: string): string {
  return `/acknowledge?${ACKNOWLEDGEMENT_TOKEN_FIELD}=${encodeURIComponent(token)}`;
}

/** Every dead code -- used, expired, superseded, another tenant's -- reads
 *  the same. */
export const ACKNOWLEDGEMENT_LINK_INVALID =
  "This code no longer works. Ask the person handing you the items to show a new one.";

export const ACKNOWLEDGEMENT_ERROR_MESSAGES: Record<string, string> = {
  AS_IS_REQUIRED: "Tick the box to say you understand.",
  AS_IS_TEXT_REQUIRED: "Something went wrong. Please try again.",
  NAME_REQUIRED: "Type your name.",
  ALREADY_ACKNOWLEDGED: "This handout has already been acknowledged.",
  DRAFT_EMPTY: "This handout is no longer open.",
};

/** What the acknowledgement page shows about the handout. No contact
 *  details: a photographed code gives away almost nothing. */
export type AcknowledgementView = {
  firstName: string | null;
  eventName: string | null;
  items: { description: string; size: string | null }[];
};

export function toAcknowledgementView(raw: unknown): AcknowledgementView {
  const row = (raw ?? {}) as {
    first_name?: string | null;
    event_name?: string | null;
    items?: { description: string; size: string | null }[] | null;
  };
  return {
    firstName: row.first_name ?? null,
    eventName: row.event_name ?? null,
    items: row.items ?? [],
  };
}
