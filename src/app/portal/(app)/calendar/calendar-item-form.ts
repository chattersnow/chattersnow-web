import { CATEGORIES, CALENDAR_STATUSES, DECISIONS, ITEM_TYPES, VISIBILITIES } from "./calendar-shared";
import type { ParseResult } from "@/lib/forms";

const ITEM_TYPE_VALUES = ITEM_TYPES.map((option) => option.value);
const CATEGORY_VALUES = CATEGORIES.map((option) => option.value);
const CALENDAR_STATUS_VALUES = CALENDAR_STATUSES.map((option) => option.value);
const VISIBILITY_VALUES = VISIBILITIES.map((option) => option.value);
const DECISION_VALUES = DECISIONS.map((option) => option.value);

export type CalendarItemFormData = {
  title: string;
  itemType: (typeof ITEM_TYPE_VALUES)[number];
  startsAt: string;
  endsAt: string | null;
  timeZone: string;
  recurrenceRule: string | null;
  summary: string | null;
  priorityTier: 1 | 2 | 3;
  priorityRationale: string | null;
  calendarStatus: (typeof CALENDAR_STATUS_VALUES)[number];
  visibility: (typeof VISIBILITY_VALUES)[number];
  ownerId: string | null;
  categories: string[];
  programIds: string[];
  decision: (typeof DECISION_VALUES)[number] | null;
  decisionNote: string | null;
};

export function parseCalendarItemForm(formData: FormData): ParseResult<CalendarItemFormData> {
  const title = String(formData.get("title") ?? "").trim();
  const itemType = String(formData.get("itemType") ?? "");
  const startsAt = String(formData.get("startsAt") ?? "");
  const endsAt = String(formData.get("endsAt") ?? "");
  const timeZone = String(formData.get("timeZone") ?? "").trim();
  const recurrenceRule = String(formData.get("recurrenceRule") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim();
  const priorityTierRaw = String(formData.get("priorityTier") ?? "");
  const priorityRationale = String(formData.get("priorityRationale") ?? "").trim();
  const calendarStatus = String(formData.get("calendarStatus") ?? "");
  const visibility = String(formData.get("visibility") ?? "");
  const ownerId = String(formData.get("ownerId") ?? "").trim();
  const categories = formData.getAll("categories").map(String);
  const programIds = formData.getAll("programIds").map(String);
  const decisionRaw = String(formData.get("decision") ?? "").trim();
  const decisionNote = String(formData.get("decisionNote") ?? "").trim();

  if (!title) return { error: "Title is required." };
  if (!ITEM_TYPE_VALUES.includes(itemType as (typeof ITEM_TYPE_VALUES)[number])) {
    return { error: "Select a valid item type." };
  }
  if (!startsAt) return { error: "Start date is required." };
  if (!timeZone) return { error: "Time zone is required." };
  if (!["1", "2", "3"].includes(priorityTierRaw)) {
    return { error: "Select a valid priority tier." };
  }
  if (!CALENDAR_STATUS_VALUES.includes(calendarStatus as (typeof CALENDAR_STATUS_VALUES)[number])) {
    return { error: "Select a valid calendar status." };
  }
  if (!VISIBILITY_VALUES.includes(visibility as (typeof VISIBILITY_VALUES)[number])) {
    return { error: "Select a valid visibility." };
  }
  for (const category of categories) {
    if (!CATEGORY_VALUES.includes(category as (typeof CATEGORY_VALUES)[number])) {
      return { error: "Select valid categories." };
    }
  }

  const startsAtIso = new Date(startsAt).toISOString();
  const endsAtIso = endsAt ? new Date(endsAt).toISOString() : null;
  if (endsAtIso && endsAtIso < startsAtIso) {
    return { error: "End date must be after the start date." };
  }

  if ((calendarStatus === "active" || calendarStatus === "complete") && !ownerId) {
    return { error: "An owner is required once a calendar item moves past idea status." };
  }

  let decision: (typeof DECISION_VALUES)[number] | null = null;
  if (decisionRaw) {
    if (!DECISION_VALUES.includes(decisionRaw as (typeof DECISION_VALUES)[number])) {
      return { error: "Select a valid decision." };
    }
    decision = decisionRaw as (typeof DECISION_VALUES)[number];
  }
  if (decision === "skip" && !decisionNote) {
    return { error: "A reason is required when an item is skipped." };
  }

  return {
    data: {
      title,
      itemType: itemType as (typeof ITEM_TYPE_VALUES)[number],
      startsAt: startsAtIso,
      endsAt: endsAtIso,
      timeZone,
      recurrenceRule: recurrenceRule || null,
      summary: summary || null,
      priorityTier: Number(priorityTierRaw) as 1 | 2 | 3,
      priorityRationale: priorityRationale || null,
      calendarStatus: calendarStatus as (typeof CALENDAR_STATUS_VALUES)[number],
      visibility: visibility as (typeof VISIBILITY_VALUES)[number],
      ownerId: ownerId || null,
      categories,
      programIds,
      decision,
      decisionNote: decisionNote || null,
    },
  };
}
