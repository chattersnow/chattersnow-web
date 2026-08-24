import type { ParseResult } from "@/lib/forms";

const SEVERITIES = ["minor", "moderate", "serious"] as const;

export type IncidentFormData = {
  occurred_at: string;
  description: string;
  severity: (typeof SEVERITIES)[number];
  people_involved: string | null;
};

export function parseIncidentForm(
  formData: FormData,
): ParseResult<IncidentFormData> {
  const occurredAt = String(formData.get("occurredAt") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const severity = String(formData.get("severity") ?? "minor");
  const peopleInvolved = String(formData.get("peopleInvolved") ?? "").trim();

  if (!description)
    return { error: "A description of the incident is required." };
  if (!SEVERITIES.includes(severity as (typeof SEVERITIES)[number])) {
    return { error: "Select a valid severity." };
  }

  return {
    data: {
      occurred_at: occurredAt
        ? new Date(occurredAt).toISOString()
        : new Date().toISOString(),
      description,
      severity: severity as (typeof SEVERITIES)[number],
      people_involved: peopleInvolved || null,
    },
  };
}
