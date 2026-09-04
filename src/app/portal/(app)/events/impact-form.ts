import type { ParseResult } from "@/lib/forms";

// Only the figures with no system source live here. Participants, first-time
// participants, beginner participants, volunteers on site and assigned discount
// codes are derived (see impact-derived-actions.ts); the survey block and the
// equipment-loan count were retired in 20260904020000.
export type ImpactFormData = {
  first_time_riders: number | null;
  rental_subsidies_count: number | null;
  assistance_total: number | null;
  beginner_pairings_count: number | null;
  notes: string | null;
};

const INTEGER_FIELDS: {
  key: keyof ImpactFormData;
  formKey: string;
  label: string;
}[] = [
  {
    key: "first_time_riders",
    formKey: "firstTimeRiders",
    label: "First-time skiers/snowboarders",
  },
  {
    key: "rental_subsidies_count",
    formKey: "rentalSubsidiesCount",
    label: "Rental subsidies",
  },
  {
    key: "beginner_pairings_count",
    formKey: "beginnerPairingsCount",
    label: "Beginner pairings",
  },
];

export function parseImpactForm(
  formData: FormData,
): ParseResult<ImpactFormData> {
  const counts: Record<string, number | null> = {};

  for (const field of INTEGER_FIELDS) {
    const raw = String(formData.get(field.formKey) ?? "").trim();
    if (!raw) {
      counts[field.key] = null;
      continue;
    }
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return { error: `${field.label} must be a positive whole number.` };
    }
    counts[field.key] = parsed;
  }

  const assistanceTotalRaw = String(
    formData.get("assistanceTotal") ?? "",
  ).trim();
  let assistanceTotal: number | null = null;
  if (assistanceTotalRaw) {
    const parsed = Number(assistanceTotalRaw);
    if (Number.isNaN(parsed) || parsed < 0) {
      return {
        error: "Total participant assistance must be a positive number.",
      };
    }
    assistanceTotal = parsed;
  }

  const notes = String(formData.get("notes") ?? "").trim() || null;

  return {
    data: {
      ...(counts as Omit<ImpactFormData, "assistance_total" | "notes">),
      assistance_total: assistanceTotal,
      notes,
    },
  };
}
