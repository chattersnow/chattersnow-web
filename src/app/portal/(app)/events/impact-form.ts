import type { ParseResult } from "@/lib/forms";

// Only free text is written here (#1588). Every impact figure is derived (see
// impact-derived-actions.ts); the four typed columns on event_impact_notes are
// archived, shown read-only where set and never written again.
export type ImpactFormData = {
  notes: string | null;
};

export function parseImpactForm(
  formData: FormData,
): ParseResult<ImpactFormData> {
  const notes = String(formData.get("notes") ?? "").trim() || null;
  return { data: { notes } };
}
