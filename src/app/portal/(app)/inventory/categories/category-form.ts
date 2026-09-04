import type { ParseResult } from "@/lib/forms";

export type CategoryFormData = {
  group_id: string;
  label: string;
  sort_order: number;
  is_active: boolean;
};

export type CategoryGroupFormData = {
  label: string;
  sort_order: number;
  is_active: boolean;
};

/**
 * Machine token for a new category or group.
 *
 * `key` is what filters, URLs, seeds, the backfill aliases and
 * `resolve_inventory_category()` join on, so it is derived once at creation and
 * never re-derived on rename — renaming "Beanie" to "Beanie / toque" must not
 * invalidate a shared filter link or orphan the alias map.
 */
export function slugifyCategoryKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseSortOrder(raw: FormDataEntryValue | null): number | null {
  if (raw === null || String(raw).trim() === "") return 0;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.trunc(value);
}

export function parseCategoryForm(
  formData: FormData,
): ParseResult<CategoryFormData> {
  const groupId = String(formData.get("groupId") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();

  if (!label) return { error: "Category name is required." };
  if (!groupId) return { error: "Select a category group." };

  const sortOrder = parseSortOrder(formData.get("sortOrder"));
  if (sortOrder === null) {
    return { error: "Sort order must be a positive number." };
  }

  return {
    data: {
      group_id: groupId,
      label,
      sort_order: sortOrder,
      is_active: formData.get("isActive") !== "off",
    },
  };
}

export function parseCategoryGroupForm(
  formData: FormData,
): ParseResult<CategoryGroupFormData> {
  const label = String(formData.get("label") ?? "").trim();
  if (!label) return { error: "Group name is required." };

  const sortOrder = parseSortOrder(formData.get("sortOrder"));
  if (sortOrder === null) {
    return { error: "Sort order must be a positive number." };
  }

  return {
    data: {
      label,
      sort_order: sortOrder,
      is_active: formData.get("isActive") !== "off",
    },
  };
}
