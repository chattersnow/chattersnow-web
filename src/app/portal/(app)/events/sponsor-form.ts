import type { ParseResult } from "@/lib/forms";

const SUPPORT_TYPES = ["cash", "in_kind", "both", "other"] as const;
const FOLLOW_UP_STATUSES = ["not_started", "in_progress", "done"] as const;

export type SponsorFormData = {
  support_type: string;
  in_kind_description: string | null;
  contribution_value: number | null;
  is_public: boolean;
  notes: string | null;
  follow_up_status: string;
  follow_up_notes: string | null;
};

export function parseSponsorForm(formData: FormData): ParseResult<SponsorFormData> {
  const supportType = String(formData.get("supportType") ?? "in_kind");
  const inKindDescription = String(formData.get("inKindDescription") ?? "").trim();
  const contributionValueRaw = String(formData.get("contributionValue") ?? "").trim();
  const isPublic = formData.get("isPublic") === "on" || formData.get("isPublic") === "true";
  const notes = String(formData.get("notes") ?? "").trim();
  const followUpStatus = String(formData.get("followUpStatus") ?? "not_started");
  const followUpNotes = String(formData.get("followUpNotes") ?? "").trim();

  if (!SUPPORT_TYPES.includes(supportType as (typeof SUPPORT_TYPES)[number])) {
    return { error: "Select a valid support type." };
  }
  if (!FOLLOW_UP_STATUSES.includes(followUpStatus as (typeof FOLLOW_UP_STATUSES)[number])) {
    return { error: "Select a valid follow-up status." };
  }

  let contributionValue: number | null = null;
  if (contributionValueRaw) {
    const parsed = Number(contributionValueRaw);
    if (Number.isNaN(parsed) || parsed < 0) {
      return { error: "Contribution value must be a positive number." };
    }
    contributionValue = parsed;
  }

  return {
    data: {
      support_type: supportType,
      in_kind_description: inKindDescription || null,
      contribution_value: contributionValue,
      is_public: isPublic,
      notes: notes || null,
      follow_up_status: followUpStatus,
      follow_up_notes: followUpNotes || null,
    },
  };
}
