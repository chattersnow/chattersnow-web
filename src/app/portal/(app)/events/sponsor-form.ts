export type ParseResult<T> = { data: T } | { error: string };

const SUPPORT_TYPES = ["cash", "in_kind", "both", "other"] as const;

export type SponsorFormData = {
  support_type: string;
  in_kind_description: string | null;
  contribution_value: number | null;
  is_public: boolean;
  notes: string | null;
};

export function parseSponsorForm(formData: FormData): ParseResult<SponsorFormData> {
  const supportType = String(formData.get("supportType") ?? "in_kind");
  const inKindDescription = String(formData.get("inKindDescription") ?? "").trim();
  const contributionValueRaw = String(formData.get("contributionValue") ?? "").trim();
  const isPublic = formData.get("isPublic") === "on" || formData.get("isPublic") === "true";
  const notes = String(formData.get("notes") ?? "").trim();

  if (!SUPPORT_TYPES.includes(supportType as (typeof SUPPORT_TYPES)[number])) {
    return { error: "Select a valid support type." };
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
    },
  };
}
