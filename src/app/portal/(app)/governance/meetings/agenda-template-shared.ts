/**
 * Where a standing section's facts come from (#1240).
 *
 * Absent means manual -- the section is a pair of free-text boxes, which is
 * what every section was before this. A source says the module already holds
 * what the board is about to be told, so the section shows those records and
 * asks only for the discussion around them.
 *
 * `categories` names `calendar_categories.key` values, never labels: the key
 * is what the platform seeds and what survives a tenant renaming the category.
 * A key the tenant has deactivated (or never had) is skipped by the feed, not
 * an error -- deactivating a category is an ordinary thing to do and must not
 * break somebody's agenda.
 */
export type AgendaSectionSource =
  | { kind: "events" }
  | { kind: "calendar"; categories?: string[]; item_types?: string[] };

export type CalendarSectionSource = Extract<
  AgendaSectionSource,
  { kind: "calendar" }
>;

export type AgendaTemplateSection = {
  key: string;
  label: string;
  topics: string[];
  /** Absent = manual: Updates / Decisions needed, today's behaviour. */
  source?: AgendaSectionSource;
};

export type AgendaTemplateRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  is_active: boolean;
  current_version_id: string | null;
};

export type AgendaTemplateVersionRow = {
  id: string;
  template_id: string;
  version: number;
  sections: AgendaTemplateSection[];
  created_at: string;
  created_by: string | null;
};

/** A template resolved together with its current version's sections, for the agenda form. */
export type ActiveAgendaTemplate = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  version_id: string;
  version: number;
  sections: AgendaTemplateSection[];
};

const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

export function isValidSectionKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringList(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) return undefined;
  const items = value.filter(
    (item): item is string => typeof item === "string",
  );
  return items.length === value.length ? items : undefined;
}

/**
 * The section's source if it is one this build knows how to render, and
 * `undefined` otherwise.
 *
 * `sections` is jsonb written by a migration, so it is only as typed as
 * whoever wrote the row -- and a template version is immutable, so a version
 * naming a `kind` that this deployment has not shipped yet (or no longer
 * ships) is a real state, not a corruption. Falling back to `undefined`
 * renders that section the manual way, with its text boxes; returning the
 * unknown source would render a section with no feed and no boxes, which is a
 * blank space where the board expected an agenda item.
 */
export function agendaSectionSource(
  section: AgendaTemplateSection,
): AgendaSectionSource | undefined {
  const source: unknown = section.source;
  if (source === undefined || source === null) return undefined;
  if (!isRecord(source)) return undefined;

  if (source.kind === "events") return { kind: "events" };

  return calendarSectionSource(source);
}

/**
 * The calendar source in `value`, or `undefined` for anything else.
 *
 * Separate from `agendaSectionSource` because the calendar feed (#1242) is a
 * Server Action taking a source the browser handed it: the template row is
 * tenant-owned jsonb that reached the client before it reached the server, so
 * the server validates it again rather than trusting the round trip. It
 * decides nothing but which rows are filtered in -- RLS decides which rows
 * exist -- so a bad one is an empty section, never an exposure.
 */
export function calendarSectionSource(
  value: unknown,
): CalendarSectionSource | undefined {
  if (!isRecord(value) || value.kind !== "calendar") return undefined;

  const categories = stringList(value.categories);
  const itemTypes = stringList(value.item_types);
  if (value.categories !== undefined && categories === undefined) {
    return undefined;
  }
  if (value.item_types !== undefined && itemTypes === undefined) {
    return undefined;
  }
  return {
    kind: "calendar",
    ...(categories ? { categories } : {}),
    ...(itemTypes ? { item_types: itemTypes } : {}),
  };
}

/**
 * The item types that say a calendar-sourced section is about *making
 * content*, rather than about dates it merely needs to know are coming.
 *
 * Marketing & Social names both of them; Community & Partnerships names
 * neither, which is exactly the difference between the two sections' rows
 * (#1243). Reading it off the source rather than off a section key means a
 * tenant that adds its own content-sourced section gets the content columns
 * without anybody editing this file -- and a section that only wants the dates
 * keeps the narrower table.
 */
const CONTENT_WORK_ITEM_TYPES = new Set([
  "content_campaign",
  "content_opportunity",
]);

/**
 * Whether a calendar source's rows should carry their content work state: the
 * status of what is written, who owns it, and when it is due out.
 *
 * Both the reader and the table ask this -- the reader to decide whether to
 * join `content_opportunities` at all, the table to decide whether to show the
 * columns -- so it has to be one function rather than two rules that can
 * drift into a section with columns and no data.
 */
export function sourceShowsContentState(
  source: AgendaSectionSource | undefined,
): boolean {
  if (source?.kind !== "calendar") return false;
  return (source.item_types ?? []).some((itemType) =>
    CONTENT_WORK_ITEM_TYPES.has(itemType),
  );
}

/** `sourceShowsContentState` for the section the agenda tab is rendering. */
export function sectionShowsContentState(
  section: AgendaTemplateSection,
): boolean {
  return sourceShowsContentState(agendaSectionSource(section));
}

/** Whether the section asks for one Discussion box instead of the manual pair. */
export function isSourcedSection(section: AgendaTemplateSection): boolean {
  return agendaSectionSource(section) !== undefined;
}
