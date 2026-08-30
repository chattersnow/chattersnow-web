import type { ParseResult } from "@/lib/forms";

export type PartnershipStage =
  | "prospecting"
  | "contacted"
  | "proposal_sent"
  | "negotiating"
  | "closed_won"
  | "closed_lost";

export const PARTNERSHIP_STAGES: readonly PartnershipStage[] = [
  "prospecting",
  "contacted",
  "proposal_sent",
  "negotiating",
  "closed_won",
  "closed_lost",
];

export const CLOSED_PARTNERSHIP_STAGES: readonly PartnershipStage[] = [
  "closed_won",
  "closed_lost",
];

export type PartnershipOpportunityFormData = {
  stage: PartnershipStage;
  next_step_date: string | null;
  notes: string | null;
};

export function parsePartnershipOpportunityForm(
  formData: FormData,
): ParseResult<PartnershipOpportunityFormData> {
  const stage = String(formData.get("stage") ?? "prospecting").trim();
  const nextStepDate = String(formData.get("nextStepDate") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!PARTNERSHIP_STAGES.includes(stage as PartnershipStage)) {
    return { error: "Invalid stage." };
  }

  return {
    data: {
      stage: stage as PartnershipStage,
      next_step_date: nextStepDate || null,
      notes: notes || null,
    },
  };
}
