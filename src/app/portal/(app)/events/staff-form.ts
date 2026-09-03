import type { ParseResult } from "@/lib/forms";

export type EventStaffFormData = {
  role: string | null;
  notes: string | null;
};

/**
 * Role is the job title for this assignment ("Basecamp lead"), free text like
 * event_volunteers.role rather than a catalog entry: there is no staff-role
 * catalog, and the volunteer one (§5.17) describes volunteer work.
 */
export function parseEventStaffForm(
  formData: FormData,
): ParseResult<EventStaffFormData> {
  const role = String(formData.get("role") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  return { data: { role: role || null, notes: notes || null } };
}
