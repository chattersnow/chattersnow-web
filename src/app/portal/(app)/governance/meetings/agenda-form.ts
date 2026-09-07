import type { ParseResult } from "@/lib/forms";

export type AgendaOngoingItem = { updates: string; decisions_needed: string };
export type AgendaUpcomingDate = {
  date: string;
  description: string;
  owner: string;
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

function isUpcomingDates(value: unknown): value is AgendaUpcomingDate[] {
  return Array.isArray(value) && value.every(isRecord);
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
