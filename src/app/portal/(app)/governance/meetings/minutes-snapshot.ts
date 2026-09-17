/**
 * The agenda, frozen into the list a notetaker works down (#1199).
 *
 * This is deliberately *not* a copy of the agenda row. It is a normalized,
 * ordered item list: one array that is simultaneously the note keys, the render
 * order and the export order, so the Minutes tab, the export and the action-item
 * link do not each re-derive "which key goes with which label" from the agenda's
 * seven columns. It is frozen because the agenda stays editable during the
 * meeting, and structure that moves under a notetaker mid-sentence is worse
 * than structure that is a few minutes stale.
 *
 * Keys are assigned once here, at seed time, and never recomputed. `new_business:0`
 * is safe precisely *because* the list it indexes is frozen alongside it.
 *
 * Guards are hand-written rather than zod, matching `agenda-form.ts`: the same
 * jsonb columns are read here, so the same "well-formed JSON is not the right
 * shape" hazard applies, and it has already bitten once (`ongoing_items` holding
 * a bare string).
 */
import type { AgendaTemplateSection } from "./agenda-template-shared";

export const MINUTES_SNAPSHOT_VERSION = 1;

export type MinutesItemKind =
  | "opening"
  | "carried_over"
  | "section"
  | "decisions"
  | "new_business"
  | "upcoming_dates"
  | "parking_lot"
  | "next_meeting";

/** What the agenda planned for one item, if anything. Never the notes. */
export type MinutesItemPlanned = {
  updates?: string;
  decisions_needed?: string;
  text?: string;
  topics?: string[];
};

export type MinutesItem = {
  /** "opening" | "section:finance_fundraising" | "new_business:0" ... */
  key: string;
  label: string;
  kind: MinutesItemKind;
  planned?: MinutesItemPlanned;
};

export type MinutesSnapshot = {
  version: number;
  meeting_date: string;
  template_id: string | null;
  template_version_id: string | null;
  external_link: string | null;
  items: MinutesItem[];
};

/**
 * The agenda columns the snapshot reads. The four jsonb ones are `unknown` on
 * purpose: their declared TypeScript shape is what the *current* form writes,
 * and rows older than that hold other shapes (see `plannedSection` below). An
 * `Agenda` from `agenda-actions.ts` satisfies this; so does a raw row.
 *
 * This module deliberately does not import `Agenda` itself -- `agenda-actions.ts`
 * is a `"use server"` module that reaches `next/cache`, and the snapshot builder
 * is imported by a Next-free action core (#1082).
 */
export type SnapshotAgenda = {
  external_link?: string | null;
  template_id?: string | null;
  template_version_id?: string | null;
  ongoing_items?: unknown;
  new_business?: unknown;
  parking_lot?: unknown;
  upcoming_dates?: unknown;
  next_meeting_date?: string | null;
  next_meeting_topics?: string | null;
};

export type BuildMinutesSnapshotInput = {
  meetingDate: string;
  agenda: SnapshotAgenda | null;
  sections: AgendaTemplateSection[];
  openingChecklist: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * `agendas.ongoing_items` is supposed to hold `{updates, decisions_needed}` per
 * section, but rows written before the structured columns settled -- and the
 * local seed itself, until #1199 fixed it -- hold a bare string. The agenda view
 * reads `?.updates` off those and silently renders "—"; here the same shape
 * would put a blank guide in front of a notetaker, so coerce instead of
 * ignoring.
 */
function plannedSection(value: unknown): {
  updates: string;
  decisions_needed: string;
} {
  if (typeof value === "string")
    return { updates: value, decisions_needed: "" };
  if (!isRecord(value)) return { updates: "", decisions_needed: "" };
  return {
    updates: typeof value.updates === "string" ? value.updates : "",
    decisions_needed:
      typeof value.decisions_needed === "string" ? value.decisions_needed : "",
  };
}

/** A legacy `upcoming_dates` entry is a bare string; there is nothing to read off it. */
function upcomingDateLine(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const parts = [value.date, value.description, value.owner].filter(
    (part): part is string => typeof part === "string" && part.trim() !== "",
  );
  return parts.length > 0 ? parts.join(" — ") : null;
}

function stringEntries(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === "string" && item.trim() !== "",
      )
    : [];
}

export function buildMinutesSnapshot(
  input: BuildMinutesSnapshotInput,
): MinutesSnapshot {
  const { agenda, sections, openingChecklist } = input;
  const items: MinutesItem[] = [];

  items.push({
    key: "opening",
    label: "Opening",
    kind: "opening",
    planned: { topics: [...openingChecklist] },
  });

  items.push({
    key: "carried_over",
    label: "Action items from previous meeting",
    kind: "carried_over",
  });

  // The sections come from the template version the agenda is pinned to, so
  // they are already the right list for this meeting even when the template has
  // moved on since.
  for (const section of sections) {
    items.push({
      key: `section:${section.key}`,
      label: section.label,
      kind: "section",
      planned: {
        ...plannedSection(
          isRecord(agenda?.ongoing_items)
            ? agenda.ongoing_items[section.key]
            : undefined,
        ),
        topics: [...section.topics],
      },
    });
  }

  items.push({
    key: "decisions",
    label: "Decisions & votes",
    kind: "decisions",
  });

  const newBusiness = stringEntries(agenda?.new_business);
  if (newBusiness.length === 0) {
    // Nothing was planned, but new business is raised in the room as often as
    // it is written down beforehand, so the notetaker still gets one place to
    // put it.
    items.push({
      key: "new_business",
      label: "New business",
      kind: "new_business",
    });
  } else {
    newBusiness.forEach((entry, index) => {
      items.push({
        key: `new_business:${index}`,
        label: entry,
        kind: "new_business",
        planned: { text: entry },
      });
    });
  }

  const upcomingDates = (
    Array.isArray(agenda?.upcoming_dates) ? agenda.upcoming_dates : []
  )
    .map(upcomingDateLine)
    .filter((line): line is string => line !== null);
  items.push({
    key: "upcoming_dates",
    label: "Upcoming dates",
    kind: "upcoming_dates",
    planned: { topics: upcomingDates },
  });

  items.push({
    key: "parking_lot",
    label: "Parking lot",
    kind: "parking_lot",
    planned: { topics: stringEntries(agenda?.parking_lot) },
  });

  const nextMeeting = [agenda?.next_meeting_date, agenda?.next_meeting_topics]
    .filter((part): part is string => typeof part === "string" && part !== "")
    .join(" — ");
  items.push({
    key: "next_meeting",
    label: "Next meeting",
    kind: "next_meeting",
    planned: { text: nextMeeting },
  });

  return {
    version: MINUTES_SNAPSHOT_VERSION,
    meeting_date: input.meetingDate,
    template_id: agenda?.template_id ?? null,
    template_version_id: agenda?.template_version_id ?? null,
    external_link: agenda?.external_link ?? null,
    items,
  };
}

const ITEM_KINDS: readonly MinutesItemKind[] = [
  "opening",
  "carried_over",
  "section",
  "decisions",
  "new_business",
  "upcoming_dates",
  "parking_lot",
  "next_meeting",
];

function isMinutesItem(value: unknown): value is MinutesItem {
  return (
    isRecord(value) &&
    typeof value.key === "string" &&
    typeof value.label === "string" &&
    ITEM_KINDS.includes(value.kind as MinutesItemKind) &&
    (value.planned === undefined || isRecord(value.planned))
  );
}

/**
 * What came back out of the jsonb column is the right shape. Called on read, not
 * on write: a row written by an older version of the builder is still a valid
 * snapshot, so this checks structure and not `version`.
 */
export function isMinutesSnapshot(value: unknown): value is MinutesSnapshot {
  return (
    isRecord(value) &&
    typeof value.version === "number" &&
    typeof value.meeting_date === "string" &&
    (value.template_id === null || typeof value.template_id === "string") &&
    (value.template_version_id === null ||
      typeof value.template_version_id === "string") &&
    (value.external_link === null || typeof value.external_link === "string") &&
    Array.isArray(value.items) &&
    value.items.every(isMinutesItem)
  );
}
