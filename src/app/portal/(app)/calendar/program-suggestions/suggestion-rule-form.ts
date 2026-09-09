import { ITEM_TYPES } from "../calendar-shared";
import type { ParseResult } from "@/lib/forms";

const ITEM_TYPE_VALUES = ITEM_TYPES.map((option) => option.value);

export type SuggestionRuleFormData = {
  itemType: (typeof ITEM_TYPE_VALUES)[number] | null;
  category: string | null;
  programId: string;
  note: string | null;
  isActive: boolean;
};

/**
 * `validCategories` is the tenant's own category keys, passed in rather than
 * imported: since #834 the vocabulary is per-tenant, so there is no constant to
 * validate against and this function stays pure and testable. The database FK
 * is the real authority; this is the check that produces a readable error
 * instead of a constraint violation.
 */
export function parseSuggestionRuleForm(
  formData: FormData,
  validCategories: readonly string[],
): ParseResult<SuggestionRuleFormData> {
  const itemTypeRaw = String(formData.get("itemType") ?? "").trim();
  const categoryRaw = String(formData.get("category") ?? "").trim();
  const programId = String(formData.get("programId") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const isActive = String(formData.get("isActive") ?? "true") === "true";

  const itemType = itemTypeRaw && itemTypeRaw !== "any" ? itemTypeRaw : null;
  const category = categoryRaw && categoryRaw !== "any" ? categoryRaw : null;

  if (itemType && !ITEM_TYPE_VALUES.includes(itemType as never)) {
    return { error: "Select a valid item type." };
  }
  if (category && !validCategories.includes(category)) {
    return { error: "Select a valid category." };
  }
  if (!itemType && !category) {
    return {
      error:
        "Select an item type, a category, or both — a rule can't match every item.",
    };
  }
  if (!programId) return { error: "Select a program to suggest." };

  return {
    data: {
      itemType: itemType as (typeof ITEM_TYPE_VALUES)[number] | null,
      category,
      programId,
      note: note || null,
      isActive,
    },
  };
}
