import type { ParseResult } from "@/lib/forms";

export type BylawsFormData = {
  version: string;
  effective_date: string;
  amendment_summary: string | null;
};

export function parseBylawsForm(
  formData: FormData,
): ParseResult<BylawsFormData> {
  const version = String(formData.get("version") ?? "").trim();
  const effectiveDate = String(formData.get("effectiveDate") ?? "").trim();
  const amendmentSummary = String(
    formData.get("amendmentSummary") ?? "",
  ).trim();

  if (!version) return { error: "Version is required." };
  if (!effectiveDate) return { error: "Effective date is required." };

  return {
    data: {
      version,
      effective_date: effectiveDate,
      amendment_summary: amendmentSummary || null,
    },
  };
}
