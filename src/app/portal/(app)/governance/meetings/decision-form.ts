import type { ParseResult } from "@/lib/forms";

export type DecisionFormData = {
  description: string;
  decision_date: string;
};

export function parseDecisionForm(
  formData: FormData,
): ParseResult<DecisionFormData> {
  const description = String(formData.get("description") ?? "").trim();
  const decisionDate = String(formData.get("decisionDate") ?? "").trim();

  if (!description) return { error: "Description is required." };
  if (!decisionDate) return { error: "Decision date is required." };

  return {
    data: {
      description,
      decision_date: decisionDate,
    },
  };
}
