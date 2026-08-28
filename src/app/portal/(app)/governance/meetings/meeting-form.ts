import type { ParseResult } from "@/lib/forms";

const MEETING_TYPES = ["board", "committee", "annual", "other"] as const;
const STATUSES = ["scheduled", "completed", "cancelled"] as const;

export type MeetingFormData = {
  meeting_date: string;
  meeting_type: string;
  status: string;
  location: string | null;
  notes: string | null;
  facilitator_person_id: string | null;
  notetaker_person_id: string | null;
};

export function parseMeetingForm(
  formData: FormData,
): ParseResult<MeetingFormData> {
  const meetingDate = String(formData.get("meetingDate") ?? "");
  const meetingType = String(formData.get("meetingType") ?? "");
  const status = String(formData.get("status") ?? "scheduled");
  const location = String(formData.get("location") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const facilitatorPersonId = String(
    formData.get("facilitatorPersonId") ?? "",
  ).trim();
  const notetakerPersonId = String(
    formData.get("notetakerPersonId") ?? "",
  ).trim();

  if (!meetingDate) return { error: "Meeting date and time are required." };
  if (!MEETING_TYPES.includes(meetingType as (typeof MEETING_TYPES)[number])) {
    return { error: "Select a valid meeting type." };
  }
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
    return { error: "Select a valid status." };
  }

  const meetingDateIso = new Date(meetingDate).toISOString();

  return {
    data: {
      meeting_date: meetingDateIso,
      meeting_type: meetingType,
      status,
      location: location || null,
      notes: notes || null,
      facilitator_person_id: facilitatorPersonId || null,
      notetaker_person_id: notetakerPersonId || null,
    },
  };
}
