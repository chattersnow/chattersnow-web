import type { ParseResult } from "@/lib/forms";

export type DisclosureFormData = {
  disclosure_year: number;
  on_file_date: string | null;
  notes: string | null;
};

export function parseDisclosureForm(
  formData: FormData,
): ParseResult<DisclosureFormData> {
  const disclosureYearRaw = String(formData.get("disclosureYear") ?? "").trim();
  const onFileDate = String(formData.get("onFileDate") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!disclosureYearRaw) return { error: "Disclosure year is required." };

  const disclosureYear = Number(disclosureYearRaw);
  if (!Number.isInteger(disclosureYear) || disclosureYear < 1900) {
    return { error: "Disclosure year must be a valid year." };
  }

  return {
    data: {
      disclosure_year: disclosureYear,
      on_file_date: onFileDate || null,
      notes: notes || null,
    },
  };
}
