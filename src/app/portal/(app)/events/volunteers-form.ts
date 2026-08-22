export type ParseResult<T> = { data: T } | { error: string };

export type VolunteerFormData = {
  role: string | null;
  notes: string | null;
};

export function parseVolunteerForm(formData: FormData): ParseResult<VolunteerFormData> {
  const role = String(formData.get("role") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  return { data: { role: role || null, notes: notes || null } };
}

export type VolunteerHoursFormData = {
  hours: number;
  loggedDate: string;
  notes: string | null;
};

export function parseVolunteerHoursForm(formData: FormData): ParseResult<VolunteerHoursFormData> {
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

  return { data: { hours, loggedDate, notes: notes || null } };
}
