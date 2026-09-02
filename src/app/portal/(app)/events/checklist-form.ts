import type { ParseResult } from "@/lib/forms";

export type ChecklistItemFormData = {
  title: string;
};

export function parseChecklistItemForm(
  formData: FormData,
): ParseResult<ChecklistItemFormData> {
  const title = String(formData.get("title") ?? "").trim();

  if (!title) return { error: "A title is required." };
  if (title.length > 200) {
    return { error: "Keep the title under 200 characters." };
  }

  return { data: { title } };
}
