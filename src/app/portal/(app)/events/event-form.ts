export type ParseResult<T> = { data: T } | { error: string };

const VISIBILITIES = ["public", "private"] as const;
const STATUSES = ["draft", "published"] as const;

export type EventFormData = {
  name: string;
  location: string | null;
  startsAt: string;
  endsAt: string | null;
  timezone: string;
  visibility: (typeof VISIBILITIES)[number];
  status: (typeof STATUSES)[number];
};

export function parseEventForm(formData: FormData): ParseResult<EventFormData> {
  const name = String(formData.get("name") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const startsAt = String(formData.get("startsAt") ?? "");
  const endsAt = String(formData.get("endsAt") ?? "");
  const timezone = String(formData.get("timezone") ?? "").trim();
  const visibility = String(formData.get("visibility") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!name) return { error: "Event name is required." };
  if (!startsAt) return { error: "Start date and time are required." };
  if (!timezone) return { error: "Timezone is required." };
  if (!VISIBILITIES.includes(visibility as (typeof VISIBILITIES)[number])) {
    return { error: "Select a valid visibility." };
  }
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
    return { error: "Select a valid status." };
  }

  const startsAtIso = new Date(startsAt).toISOString();
  const endsAtIso = endsAt ? new Date(endsAt).toISOString() : null;
  if (endsAtIso && endsAtIso < startsAtIso) {
    return { error: "End time must be after the start time." };
  }

  return {
    data: {
      name,
      location: location || null,
      startsAt: startsAtIso,
      endsAt: endsAtIso,
      timezone,
      visibility: visibility as (typeof VISIBILITIES)[number],
      status: status as (typeof STATUSES)[number],
    },
  };
}

export type EventAttendanceFormData = {
  attendanceCount: number | null;
  attendanceNotes: string | null;
};

export function parseEventAttendanceForm(formData: FormData): ParseResult<EventAttendanceFormData> {
  const countRaw = String(formData.get("attendanceCount") ?? "").trim();
  const notes = String(formData.get("attendanceNotes") ?? "").trim();

  let attendanceCount: number | null = null;
  if (countRaw) {
    const parsed = Number(countRaw);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return { error: "Attendance must be a whole number of 0 or more." };
    }
    attendanceCount = parsed;
  }

  return { data: { attendanceCount, attendanceNotes: notes || null } };
}
