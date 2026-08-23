export type ParseResult<T> = { data: T } | { error: string };

export type ParticipationHoursFormData = {
  eventId: string | null;
  volunteerRoleTypeId: string | null;
  hours: number;
  loggedDate: string;
  notes: string | null;
};

export function parseParticipationHoursForm(formData: FormData): ParseResult<ParticipationHoursFormData> {
  const eventId = String(formData.get("eventId") ?? "").trim();
  const volunteerRoleTypeId = String(formData.get("volunteerRoleTypeId") ?? "").trim();
  const hoursRaw = String(formData.get("hours") ?? "").trim();
  const loggedDate = String(formData.get("loggedDate") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  const hours = Number(hoursRaw);
  if (!hoursRaw || Number.isNaN(hours) || hours <= 0) {
    return { error: "Hours must be a positive number." };
  }
  if (!loggedDate) {
    return { error: "Date is required." };
  }

  return {
    data: {
      eventId: eventId || null,
      volunteerRoleTypeId: volunteerRoleTypeId || null,
      hours,
      loggedDate,
      notes: notes || null,
    },
  };
}
