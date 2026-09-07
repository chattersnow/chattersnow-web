import type { ParseResult } from "@/lib/forms";

/** Keys are column names -- callers spread this straight into the insert. */
export type VolunteerFormData = {
  role: string | null;
  volunteer_role_type_id: string | null;
  notes: string | null;
};

export function parseVolunteerForm(
  formData: FormData,
): ParseResult<VolunteerFormData> {
  const role = String(formData.get("role") ?? "").trim();
  const volunteerRoleTypeId = String(
    formData.get("volunteerRoleTypeId") ?? "",
  ).trim();
  const notes = String(formData.get("notes") ?? "").trim();

  return {
    data: {
      role: role || null,
      volunteer_role_type_id: volunteerRoleTypeId || null,
      notes: notes || null,
    },
  };
}

export type EventVolunteerHoursFormData = {
  volunteerRoleTypeId: string | null;
  hours: number;
  loggedDate: string;
  notes: string | null;
};

export function parseEventVolunteerHoursForm(
  formData: FormData,
): ParseResult<EventVolunteerHoursFormData> {
  const volunteerRoleTypeId = String(
    formData.get("volunteerRoleTypeId") ?? "",
  ).trim();
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
      volunteerRoleTypeId: volunteerRoleTypeId || null,
      hours,
      loggedDate,
      notes: notes || null,
    },
  };
}
