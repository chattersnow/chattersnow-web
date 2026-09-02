import type { ParseResult } from "@/lib/forms";

export type DecisionFormData = {
  description: string;
  decision_date: string;
  topic: string | null;
  vote_result: string | null;
};

export function parseDecisionForm(
  formData: FormData,
): ParseResult<DecisionFormData> {
  const description = String(formData.get("description") ?? "").trim();
  const decisionDate = String(formData.get("decisionDate") ?? "").trim();
  const topic = String(formData.get("topic") ?? "").trim();
  const voteResult = String(formData.get("voteResult") ?? "").trim();

  if (!description) return { error: "Description is required." };
  if (!decisionDate) return { error: "Decision date is required." };

  return {
    data: {
      description,
      decision_date: decisionDate,
      topic: topic || null,
      vote_result: voteResult || null,
    },
  };
}
