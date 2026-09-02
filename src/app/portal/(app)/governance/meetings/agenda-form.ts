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

  let ongoingItems: Record<string, AgendaOngoingItem>;
  try {
    ongoingItems = JSON.parse(String(formData.get("ongoingItems") ?? "{}"));
  } catch {
    return {
      error: "Could not read the ongoing board items. Please try again.",
    };
  }

  let newBusiness: string[];
  try {
    newBusiness = JSON.parse(String(formData.get("newBusiness") ?? "[]"));
  } catch {
    return { error: "Could not read the new business list. Please try again." };
  }

  let parkingLot: string[];
  try {
    parkingLot = JSON.parse(String(formData.get("parkingLot") ?? "[]"));
  } catch {
    return { error: "Could not read the parking lot list. Please try again." };
  }

  let upcomingDates: AgendaUpcomingDate[];
  try {
    upcomingDates = JSON.parse(String(formData.get("upcomingDates") ?? "[]"));
  } catch {
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
