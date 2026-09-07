import type { ParseResult } from "@/lib/forms";

const CONDITIONS = ["new", "like_new", "good", "fair", "poor"] as const;
const STATUSES = [
  "available",
  "reserved",
  "distributed",
  "damaged",
  "lost",
  "retired",
  "other",
] as const;
const INTENDED_USES = ["gear_library", "giveaway", "internal"] as const;

export type InventoryItemFormData = {
  description: string;
  category_id: string;
  /**
   * Free-text detail behind the "Other" category, stored in the legacy `type`
   * column (issue #667). Null for every other category, so a reclassified item
   * doesn't keep a stale description of a category it no longer has.
   */
  type: string | null;
  size: string | null;
  gender: string | null;
  condition: string;
  face_value: number | null;
  status: string;
  intended_use: string;
  photo_url: string | null;
  notes: string | null;
};

export function parseInventoryItemForm(
  formData: FormData,
): ParseResult<InventoryItemFormData> {
  const description = String(formData.get("description") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "").trim();
  const categoryDetail = String(formData.get("categoryDetail") ?? "").trim();
  const condition = String(formData.get("condition") ?? "");
  const status = String(formData.get("status") ?? "");
  const intendedUse = String(formData.get("intendedUse") ?? "");

  if (!description) {
    return { error: "Item description is required." };
  }
  if (!categoryId) {
    return { error: "Item category is required." };
  }
  // The picker only reveals the detail field for "Other", and only then is it
  // required -- an empty box there means the item is filed as "Other" with
  // nothing said about what it actually is.
  if (formData.get("categoryIsOther") === "true" && !categoryDetail) {
    return { error: "Describe the item when the category is Other." };
  }
  if (!CONDITIONS.includes(condition as (typeof CONDITIONS)[number])) {
    return { error: "Select a valid item condition." };
  }
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
    return { error: "Select a valid item status." };
  }
  if (!INTENDED_USES.includes(intendedUse as (typeof INTENDED_USES)[number])) {
    return { error: "Select a valid intended use." };
  }

  const faceValueRaw = formData.get("faceValue");
  const faceValue = faceValueRaw ? Number(faceValueRaw) : null;
  if (faceValueRaw && (Number.isNaN(faceValue) || (faceValue as number) < 0)) {
    return { error: "Face value must be a positive number." };
  }

  return {
    data: {
      description,
      category_id: categoryId,
      type: categoryDetail || null,
      size: String(formData.get("size") ?? "").trim() || null,
      gender: String(formData.get("gender") ?? "") || null,
      condition,
      face_value: faceValue,
      status,
      intended_use: intendedUse,
      photo_url: String(formData.get("photoUrl") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  };
}
