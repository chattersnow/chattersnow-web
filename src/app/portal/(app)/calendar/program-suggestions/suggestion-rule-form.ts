import { CATEGORIES, ITEM_TYPES } from "../calendar-shared";
import type { ParseResult } from "@/lib/forms";

const ITEM_TYPE_VALUES = ITEM_TYPES.map((option) => option.value);
const CATEGORY_VALUES = CATEGORIES.map((option) => option.value);

export type SuggestionRuleFormData = {
  itemType: (typeof ITEM_TYPE_VALUES)[number] | null;
  category: (typeof CATEGORY_VALUES)[number] | null;
  programId: string;
  note: string | null;
  isActive: boolean;
};

export function parseSuggestionRuleForm(
  formData: FormData,
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
  if (category && !CATEGORY_VALUES.includes(category as never)) {
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
      category: category as (typeof CATEGORY_VALUES)[number] | null,
      programId,
      note: note || null,
      isActive,
    },
  };
}
