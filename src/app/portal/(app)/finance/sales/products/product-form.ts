import type { ParseResult } from "@/lib/forms";

export type ProductFormData = {
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
};

/**
 * Shared by the product and variant parsers.
 *
 * An absent or blank field means 0 rather than an error: sort order is the
 * optional tiebreaker on an alphabetical list, and making every dialog fill it
 * in would be noise. Anything present but not a non-negative number is a real
 * mistake and says so.
 */
export function parseSortOrder(raw: FormDataEntryValue | null): number | null {
  if (raw === null || String(raw).trim() === "") return 0;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.trunc(value);
}

export function parseProductForm(
  formData: FormData,
): ParseResult<ProductFormData> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Product name is required." };

  const sortOrder = parseSortOrder(formData.get("sortOrder"));
  if (sortOrder === null) {
    return { error: "Sort order must be a positive number." };
  }

  const description = String(formData.get("description") ?? "").trim();

  return {
    data: {
      name,
      // null rather than "", so an emptied description reads the same as one
      // that was never written.
      description: description || null,
      // Absent means on. A checkbox that is unchecked submits nothing at all,
      // so the dialogs post an explicit "off" and everything else is active.
      is_active: formData.get("isActive") !== "off",
      sort_order: sortOrder,
    },
  };
}
