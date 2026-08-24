import type { ParseResult } from "@/lib/forms";

export type ShiftFormData = {
  label: string;
  startsAt: string;
  endsAt: string;
  targetHeadcount: number | null;
  notes: string | null;
};

export function parseShiftForm(formData: FormData): ParseResult<ShiftFormData> {
  const label = String(formData.get("label") ?? "").trim();
  const startsAt = String(formData.get("startsAt") ?? "").trim();
  const endsAt = String(formData.get("endsAt") ?? "").trim();
  const targetHeadcountRaw = String(formData.get("targetHeadcount") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!label) {
    return { error: "Label is required." };
  }
  if (!startsAt || !endsAt) {
    return { error: "Start and end time are required." };
  }

  const startsAtIso = new Date(startsAt).toISOString();
  const endsAtIso = new Date(endsAt).toISOString();
  if (endsAtIso <= startsAtIso) {
    return { error: "End time must be after start time." };
  }

  let targetHeadcount: number | null = null;
  if (targetHeadcountRaw) {
    targetHeadcount = Number(targetHeadcountRaw);
    if (Number.isNaN(targetHeadcount) || targetHeadcount <= 0) {
      return { error: "Target headcount must be a positive number." };
    }
  }

  return { data: { label, startsAt: startsAtIso, endsAt: endsAtIso, targetHeadcount, notes: notes || null } };
}
