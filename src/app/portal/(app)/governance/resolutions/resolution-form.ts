import type { ParseResult } from "@/lib/forms";

export type VoteOutcome = "pending" | "passed" | "failed" | "tabled";

const VOTE_OUTCOMES: readonly VoteOutcome[] = [
  "pending",
  "passed",
  "failed",
  "tabled",
];

export type ResolutionFormData = {
  motion_text: string;
  vote_outcome: VoteOutcome;
  effective_date: string | null;
};

export function parseResolutionForm(
  formData: FormData,
): ParseResult<ResolutionFormData> {
  const motionText = String(formData.get("motionText") ?? "").trim();
  const voteOutcome = String(formData.get("voteOutcome") ?? "pending").trim();
  const effectiveDate = String(formData.get("effectiveDate") ?? "").trim();

  if (!motionText) return { error: "Motion text is required." };
  if (!VOTE_OUTCOMES.includes(voteOutcome as VoteOutcome)) {
    return { error: "Invalid vote outcome." };
  }

  return {
    data: {
      motion_text: motionText,
      vote_outcome: voteOutcome as VoteOutcome,
      effective_date: effectiveDate || null,
    },
  };
}
