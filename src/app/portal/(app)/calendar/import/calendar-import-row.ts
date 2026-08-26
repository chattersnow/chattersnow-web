import Papa from "papaparse";
import { ITEM_TYPES, CATEGORIES, PRIORITY_TIERS } from "../calendar-shared";

const ITEM_TYPE_VALUES = ITEM_TYPES.map((option) => option.value);
const CATEGORY_VALUES = CATEGORIES.map((option) => option.value);
const PRIORITY_TIER_VALUES = PRIORITY_TIERS.map((option) => option.value);

export type CalendarImportRow = {
  title: string;
  itemType: (typeof ITEM_TYPE_VALUES)[number];
  startsAt: string;
  endsAt: string | null;
  timeZone: string;
  recurrenceRule: string | null;
  priorityTier: 1 | 2 | 3;
  category: (typeof CATEGORY_VALUES)[number];
  region: string | null;
};

export type CalendarImportCsvRow = {
  title?: string;
  item_type?: string;
  starts_at?: string;
  ends_at?: string;
  time_zone?: string;
  recurrence_rule?: string;
  priority_tier?: string;
  category?: string;
  region?: string;
};

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function parseCalendarImportRow(
  raw: CalendarImportCsvRow,
  rowNumber: number,
): { data: CalendarImportRow } | { error: string } {
  const title = (raw.title ?? "").trim();
  const itemType = (raw.item_type ?? "").trim();
  const startsAtRaw = (raw.starts_at ?? "").trim();
  const endsAtRaw = (raw.ends_at ?? "").trim();
  const timeZone = (raw.time_zone ?? "").trim();
  const recurrenceRule = (raw.recurrence_rule ?? "").trim();
  const priorityTierRaw = (raw.priority_tier ?? "").trim();
  const category = (raw.category ?? "").trim();
  const region = (raw.region ?? "").trim();

  if (!title && !itemType && !startsAtRaw) {
    return { error: `row ${rowNumber}: blank` };
  }
  if (!title) return { error: `row ${rowNumber}: title is required` };
  if (
    !ITEM_TYPE_VALUES.includes(itemType as (typeof ITEM_TYPE_VALUES)[number])
  ) {
    return { error: `row ${rowNumber}: invalid item_type "${itemType}"` };
  }
  if (!startsAtRaw) return { error: `row ${rowNumber}: starts_at is required` };
  const startsAtDate = new Date(startsAtRaw);
  if (Number.isNaN(startsAtDate.getTime())) {
    return {
      error: `row ${rowNumber}: starts_at "${startsAtRaw}" isn't a valid date`,
    };
  }
  let endsAtDate: Date | null = null;
  if (endsAtRaw) {
    endsAtDate = new Date(endsAtRaw);
    if (Number.isNaN(endsAtDate.getTime())) {
      return {
        error: `row ${rowNumber}: ends_at "${endsAtRaw}" isn't a valid date`,
      };
    }
    if (endsAtDate < startsAtDate) {
      return {
        error: `row ${rowNumber}: ends_at must be on or after starts_at`,
      };
    }
  }
  if (!timeZone) return { error: `row ${rowNumber}: time_zone is required` };
  if (!isValidTimeZone(timeZone)) {
    return {
      error: `row ${rowNumber}: time_zone "${timeZone}" isn't a valid IANA zone`,
    };
  }
  if (
    !PRIORITY_TIER_VALUES.includes(
      priorityTierRaw as (typeof PRIORITY_TIER_VALUES)[number],
    )
  ) {
    return { error: `row ${rowNumber}: priority_tier must be 1, 2, or 3` };
  }
  if (!CATEGORY_VALUES.includes(category as (typeof CATEGORY_VALUES)[number])) {
    return { error: `row ${rowNumber}: invalid category "${category}"` };
  }

  return {
    data: {
      title,
      itemType: itemType as (typeof ITEM_TYPE_VALUES)[number],
      startsAt: startsAtDate.toISOString(),
      endsAt: endsAtDate ? endsAtDate.toISOString() : null,
      timeZone,
      recurrenceRule: recurrenceRule || null,
      priorityTier: Number(priorityTierRaw) as 1 | 2 | 3,
      category: category as (typeof CATEGORY_VALUES)[number],
      region: region || null,
    },
  };
}

export function parseCalendarImportCsv(csvText: string): {
  rows: ({ data: CalendarImportRow } | { error: string })[];
  totalRows: number;
} {
  const parsed = Papa.parse<CalendarImportCsvRow>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const rows = parsed.data.map((row, i) => parseCalendarImportRow(row, i + 2));
  return { rows, totalRows: parsed.data.length };
}
