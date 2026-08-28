import type { ParseResult } from "@/lib/forms";

export type ActionItemFormData = {
  description: string;
  due_date: string | null;
  status: "open" | "done";
};

export function parseActionItemForm(
  formData: FormData,
): ParseResult<ActionItemFormData> {
  const description = String(formData.get("description") ?? "").trim();
  const dueDate = String(formData.get("dueDate") ?? "").trim();
  const status = String(formData.get("status") ?? "open").trim();

  if (!description) return { error: "Description is required." };
  if (status !== "open" && status !== "done")
    return { error: "Invalid status." };

  return {
    data: {
      description,
      due_date: dueDate || null,
      status,
    },
  };
}
