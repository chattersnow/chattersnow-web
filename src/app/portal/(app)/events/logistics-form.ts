import type { ParseResult } from "@/lib/forms";

export type LogisticsFormData = {
  meeting_point: string | null;
  gear_requirements: string | null;
  transportation: string | null;
  food: string | null;
  supplies: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  notes: string | null;
};

export function parseLogisticsForm(formData: FormData): ParseResult<LogisticsFormData> {
  const field = (key: string) => String(formData.get(key) ?? "").trim() || null;

  return {
    data: {
      meeting_point: field("meetingPoint"),
      gear_requirements: field("gearRequirements"),
      transportation: field("transportation"),
      food: field("food"),
      supplies: field("supplies"),
      emergency_contact_name: field("emergencyContactName"),
      emergency_contact_phone: field("emergencyContactPhone"),
      notes: field("notes"),
    },
  };
}
