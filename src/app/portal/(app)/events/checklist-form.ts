import type { ParseResult } from "@/lib/forms";

export type ChecklistItemFormData = {
  title: string;
  owner_person_id: string | null;
  due_date: string | null;
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function parseChecklistItemForm(
  formData: FormData,
): ParseResult<ChecklistItemFormData> {
  const title = String(formData.get("title") ?? "").trim();
  const owner = String(formData.get("ownerPersonId") ?? "").trim();
  const dueDate = String(formData.get("dueDate") ?? "").trim();

  if (!title) return { error: "A title is required." };
  if (title.length > 200) {
    return { error: "Keep the title under 200 characters." };
  }
  if (dueDate && !DATE_ONLY.test(dueDate)) {
    return { error: "Enter a valid due date.", field: "dueDate" };
  }

  return {
    data: {
      title,
      owner_person_id: owner || null,
      due_date: dueDate || null,
    },
  };
}
