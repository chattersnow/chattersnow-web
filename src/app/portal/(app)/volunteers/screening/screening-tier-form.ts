import type { ParseResult } from "@/lib/forms";

export type ScreeningTierFormData = {
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
};

export function parseScreeningTierForm(
  formData: FormData,
): ParseResult<ScreeningTierFormData> {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const sortOrderRaw = String(formData.get("sortOrder") ?? "").trim();
  const isActive = formData.get("isActive") === "on";

  if (!name) return { error: "A level name is required.", field: "name" };

  const sortOrder = sortOrderRaw === "" ? 0 : Number(sortOrderRaw);
  if (!Number.isInteger(sortOrder)) {
    return { error: "Order must be a whole number.", field: "sortOrder" };
  }

  return {
    data: {
      name,
      description: description || null,
      sort_order: sortOrder,
      is_active: isActive,
    },
  };
}
