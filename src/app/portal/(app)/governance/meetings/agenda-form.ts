import type { ParseResult } from "@/lib/forms";

/**
 * One standing section's per-meeting text (#1240).
 *
 * All three are optional because a section's shape follows its template
 * version, and both shapes have to be readable at once: a **manual** section
 * writes `updates`/`decisions_needed`, a **sourced** one writes `discussion`,
 * and a template revised from one to the other (or back) must not drop what
 * somebody already typed. So reading tolerates any of the three on any
 * section, and the form renders whatever is present rather than migrating old
 * values into `discussion`.
 */
export type AgendaOngoingItem = {
  updates?: string;
  decisions_needed?: string;
  discussion?: string;
};

/** Which record a pinned upcoming date was copied from. */
export type AgendaUpcomingDateSourceKind = "event" | "calendar_item";

export const AGENDA_UPCOMING_DATE_SOURCE_KINDS: readonly AgendaUpcomingDateSourceKind[] =
  ["event", "calendar_item"];

/**
 * A row of the agenda's "Upcoming dates" list.
 *
 * The three text fields stay editable even on a pinned row -- the description
 * is a copy, and whoever writes the agenda may well word it for the board
 * rather than for the calendar. The two optional source fields are what make a
 * date in the frozen minutes a link back to the record instead of dead text
 * (#1223). They are stored in the same jsonb column, so there is no migration.
 */
export type AgendaUpcomingDate = {
  date: string;
  description: string;
  owner: string;
  source_kind?: AgendaUpcomingDateSourceKind;
  source_id?: string;
};

export type AgendaFormData = {
  external_link: string | null;
  body_text: string | null;
  template_id: string | null;
  template_version_id: string | null;
  ongoing_items: Record<string, AgendaOngoingItem>;
  new_business: string[];
  parking_lot: string[];
  upcoming_dates: AgendaUpcomingDate[];
  next_meeting_date: string | null;
  next_meeting_topics: string | null;
};

/**
 * `JSON.parse` only tells us the text was well-formed, not that it holds what
 * the client is supposed to send. Without these guards a hand-built POST of
 * `newBusiness=null` threw a TypeError out of the parser and out of the server
 * action -- an unhandled rejection instead of the friendly `{ error }` every
 * other branch here returns -- and `ongoingItems="hi"` wrote a bare string into
 * the jsonb column.
 */
function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOngoingItems(
  value: unknown,
): value is Record<string, AgendaOngoingItem> {
  return isRecord(value) && Object.values(value).every(isRecord);
}

/**
 * A pin is both fields or neither. Half a pair is not a weaker link, it is an
 * unresolvable one -- a `source_kind` with no id names no record, and an id
 * with no kind names two different tables -- and either would reach the minutes
 * snapshot as a reference that cannot be rendered.
 */
function isUpcomingDateSource(value: Record<string, unknown>): boolean {
  const { source_kind: kind, source_id: id } = value;
  if (kind === undefined && id === undefined) return true;
  return (
    typeof kind === "string" &&
    AGENDA_UPCOMING_DATE_SOURCE_KINDS.includes(
      kind as AgendaUpcomingDateSourceKind,
    ) &&
    typeof id === "string" &&
    id.trim() !== ""
  );
}

function isUpcomingDates(value: unknown): value is AgendaUpcomingDate[] {
  return (
    Array.isArray(value) &&
    value.every((item) => isRecord(item) && isUpcomingDateSource(item))
  );
}

export function parseAgendaForm(
  formData: FormData,
): ParseResult<AgendaFormData> {
  const externalLink = String(formData.get("externalLink") ?? "").trim();
  const bodyText = String(formData.get("bodyText") ?? "").trim();
  const templateId = String(formData.get("templateId") ?? "").trim();
  const templateVersionId = String(
    formData.get("templateVersionId") ?? "",
  ).trim();
  const nextMeetingDate = String(formData.get("nextMeetingDate") ?? "").trim();
  const nextMeetingTopics = String(
    formData.get("nextMeetingTopics") ?? "",
  ).trim();

  let ongoingItems: unknown;
  try {
    ongoingItems = JSON.parse(String(formData.get("ongoingItems") ?? "{}"));
  } catch {
    ongoingItems = undefined;
  }
  if (!isOngoingItems(ongoingItems)) {
    return {
      error: "Could not read the ongoing board items. Please try again.",
    };
  }

  let newBusiness: unknown;
  try {
    newBusiness = JSON.parse(String(formData.get("newBusiness") ?? "[]"));
  } catch {
    newBusiness = undefined;
  }
  if (!isStringArray(newBusiness)) {
    return { error: "Could not read the new business list. Please try again." };
  }

  let parkingLot: unknown;
  try {
    parkingLot = JSON.parse(String(formData.get("parkingLot") ?? "[]"));
  } catch {
    parkingLot = undefined;
  }
  if (!isStringArray(parkingLot)) {
    return { error: "Could not read the parking lot list. Please try again." };
  }

  let upcomingDates: unknown;
  try {
    upcomingDates = JSON.parse(String(formData.get("upcomingDates") ?? "[]"));
  } catch {
    upcomingDates = undefined;
  }
  if (!isUpcomingDates(upcomingDates)) {
    return {
      error: "Could not read the upcoming dates list. Please try again.",
    };
  }

  return {
    data: {
      external_link: externalLink || null,
      body_text: bodyText || null,
      template_id: templateId || null,
      template_version_id: templateVersionId || null,
      ongoing_items: ongoingItems,
      new_business: newBusiness.filter((item) => item.trim() !== ""),
      parking_lot: parkingLot.filter((item) => item.trim() !== ""),
      upcoming_dates: upcomingDates.filter(
        (item) => item.date || item.description || item.owner,
      ),
      next_meeting_date: nextMeetingDate || null,
      next_meeting_topics: nextMeetingTopics || null,
    },
  };
}
