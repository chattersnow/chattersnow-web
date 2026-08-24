import type { ParseResult } from "@/lib/forms";

export type ImpactFormData = {
  total_participants: number | null;
  first_time_participants: number | null;
  first_time_riders: number | null;
  beginner_participants: number | null;
  volunteer_participants: number | null;
  subsidized_tickets_count: number | null;
  rental_subsidies_count: number | null;
  equipment_loans_count: number | null;
  assistance_total: number | null;
  beginner_pairings_count: number | null;
  survey_respondents_count: number | null;
  survey_easier_to_participate_yes_count: number | null;
  survey_would_not_have_participated_without_assistance_yes_count: number | null;
  survey_first_time_skiing_yes_count: number | null;
  survey_felt_welcomed_yes_count: number | null;
  survey_would_attend_again_yes_count: number | null;
  notes: string | null;
};

const INTEGER_FIELDS: { key: keyof ImpactFormData; formKey: string; label: string }[] = [
  { key: "total_participants", formKey: "totalParticipants", label: "Total participants" },
  { key: "first_time_participants", formKey: "firstTimeParticipants", label: "First-time participants" },
  { key: "first_time_riders", formKey: "firstTimeRiders", label: "First-time skiers/snowboarders" },
  { key: "beginner_participants", formKey: "beginnerParticipants", label: "Beginner participants" },
  { key: "volunteer_participants", formKey: "volunteerParticipants", label: "Volunteer participants" },
  { key: "subsidized_tickets_count", formKey: "subsidizedTicketsCount", label: "Subsidized tickets" },
  { key: "rental_subsidies_count", formKey: "rentalSubsidiesCount", label: "Rental subsidies" },
  { key: "equipment_loans_count", formKey: "equipmentLoansCount", label: "Equipment loans" },
  { key: "beginner_pairings_count", formKey: "beginnerPairingsCount", label: "Beginner pairings" },
  { key: "survey_respondents_count", formKey: "surveyRespondentsCount", label: "Survey respondents" },
  {
    key: "survey_easier_to_participate_yes_count",
    formKey: "surveyEasierToParticipateYesCount",
    label: "“Easier to participate” yes count",
  },
  {
    key: "survey_would_not_have_participated_without_assistance_yes_count",
    formKey: "surveyWouldNotHaveParticipatedWithoutAssistanceYesCount",
    label: "“Would not have participated without assistance” yes count",
  },
  {
    key: "survey_first_time_skiing_yes_count",
    formKey: "surveyFirstTimeSkiingYesCount",
    label: "“First time skiing/snowboarding” yes count",
  },
  {
    key: "survey_felt_welcomed_yes_count",
    formKey: "surveyFeltWelcomedYesCount",
    label: "“Felt welcomed and included” yes count",
  },
  {
    key: "survey_would_attend_again_yes_count",
    formKey: "surveyWouldAttendAgainYesCount",
    label: "“Would attend another event” yes count",
  },
];

export function parseImpactForm(formData: FormData): ParseResult<ImpactFormData> {
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

  const assistanceTotalRaw = String(formData.get("assistanceTotal") ?? "").trim();
  let assistanceTotal: number | null = null;
  if (assistanceTotalRaw) {
    const parsed = Number(assistanceTotalRaw);
    if (Number.isNaN(parsed) || parsed < 0) {
      return { error: "Total participant assistance must be a positive number." };
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
