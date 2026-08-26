import type { ParseResult } from "@/lib/forms";

export type PolicyFormData = {
  name: string;
  category: string | null;
  effective_date: string;
  version: string;
};

export function parsePolicyForm(
  formData: FormData,
): ParseResult<PolicyFormData> {
  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const effectiveDate = String(formData.get("effectiveDate") ?? "").trim();
  const version = String(formData.get("version") ?? "").trim();

  if (!name) return { error: "Policy name is required." };
  if (!effectiveDate) return { error: "Effective date is required." };
  if (!version) return { error: "Version is required." };

  return {
    data: {
      name,
      category: category || null,
      effective_date: effectiveDate,
      version,
    },
  };
}
