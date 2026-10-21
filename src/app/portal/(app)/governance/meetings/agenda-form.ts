import type { ParseResult } from "@/lib/forms";
import { parseDocumentFields } from "./content-form";

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
  document_path: string | null;
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
  const document = parseDocumentFields(formData);
  if ("error" in document) return document;
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
      ...document.data,
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

/**
 * Which agenda shape a row holds (#1623). Only a board meeting gets the
 * structured, template-driven agenda; every other type gets a list of items.
 *
 * Stored on the row (`agendas.format`) rather than read off the meeting each
 * time, because a meeting's type can change after its agenda is written, and
 * the agenda then keeps rendering -- read-only -- in the shape it was written
 * in rather than being reinterpreted as the other one.
 */
export type AgendaFormat = "board" | "simple";

export function agendaFormatForMeetingType(meetingType: string): AgendaFormat {
  return meetingType === "board" ? "board" : "simple";
}

/**
 * One item of a simple agenda. `id` is minted in the browser when the item is
 * added and never changes, so a rename or a reorder keeps the minutes note
 * keyed `item:<id>` attached to the same item.
 */
export type AgendaItem = {
  id: string;
  title: string;
  notes?: string;
  /** Set on an item pre-filled from the meeting's linked event (#1624). */
  source?: AgendaItemSource;
};

/**
 * The open piece of event work an item was pre-filled from (#1624), frozen
 * like a pinned upcoming date (#1223). `kind`/`id`/`label`/`date` are the
 * record the agenda and minutes link to -- the event the work sits on, which
 * for a carried-forward action is the earlier event. `key` names the work
 * itself (`event_planning_<event id>`, `event_checklist_<item id>`,
 * `retro_action_<item id>`), and is what "Refresh from event" deduplicates on:
 * one event holds several pieces of work, so the record alone cannot.
 */
export type AgendaItemSource = {
  key: string;
  kind: AgendaUpcomingDateSourceKind;
  id: string;
  label: string;
  date: string;
};

function isAgendaItemSource(value: unknown): value is AgendaItemSource {
  return (
    isRecord(value) &&
    typeof value.key === "string" &&
    value.key.trim() !== "" &&
    typeof value.kind === "string" &&
    AGENDA_UPCOMING_DATE_SOURCE_KINDS.includes(
      value.kind as AgendaUpcomingDateSourceKind,
    ) &&
    typeof value.id === "string" &&
    value.id.trim() !== "" &&
    typeof value.label === "string" &&
    typeof value.date === "string"
  );
}

/**
 * What an item id may be: a `crypto.randomUUID()`, or anything else drawn from
 * the same lowercase alphabet. Checked because the id becomes half of a minutes
 * note key, and `parseMinutesPatch` refuses a key outside that alphabet -- an
 * id that slipped past here would freeze into a snapshot item nobody could
 * write a note under.
 */
export const AGENDA_ITEM_ID_PATTERN = /^[a-z0-9_-]{1,64}$/;

export function isAgendaItems(value: unknown): value is AgendaItem[] {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      !AGENDA_ITEM_ID_PATTERN.test(item.id) ||
      ids.has(item.id) ||
      typeof item.title !== "string" ||
      (item.notes !== undefined && typeof item.notes !== "string") ||
      (item.source !== undefined && !isAgendaItemSource(item.source))
    ) {
      return false;
    }
    ids.add(item.id);
  }
  return true;
}

export type SimpleAgendaFormData = {
  external_link: string | null;
  document_path: string | null;
  items: AgendaItem[];
};

/** Only the source's own fields reach the column, not whatever else was posted. */
function pickSource({ key, kind, id, label, date }: AgendaItemSource) {
  return { key, kind, id, label, date };
}

/**
 * A simple agenda's form. The same guard-then-normalize order as
 * `parseAgendaForm`: a hand-built POST is refused with a message rather than
 * thrown on, and only then are blanks trimmed away. A row left entirely blank
 * is dropped, the way the board form drops an empty upcoming date; one with
 * notes and no title is refused, since the title is what the minutes are
 * headed with.
 */
export function parseSimpleAgendaForm(
  formData: FormData,
): ParseResult<SimpleAgendaFormData> {
  const document = parseDocumentFields(formData);
  if ("error" in document) return document;

  let items: unknown;
  try {
    items = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    items = undefined;
  }
  if (!isAgendaItems(items)) {
    return { error: "Could not read the agenda items. Please try again." };
  }

  const normalized: AgendaItem[] = [];
  for (const item of items) {
    const title = item.title.trim();
    const notes = item.notes?.trim() ?? "";
    if (!title && !notes) continue;
    if (!title) return { error: "Every agenda item needs a title." };
    normalized.push({
      id: item.id,
      title,
      ...(notes ? { notes } : {}),
      ...(item.source ? { source: pickSource(item.source) } : {}),
    });
  }

  return { data: { ...document.data, items: normalized } };
}
