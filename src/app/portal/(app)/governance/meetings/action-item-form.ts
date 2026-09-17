import type { ParseResult } from "@/lib/forms";

export type ActionItemFormData = {
  description: string;
  due_date: string | null;
  status: "open" | "done";
  /**
   * The minutes item this action was raised under (#1199), e.g.
   * "section:finance_fundraising".
   *
   * Optional rather than nullable, and absent when the form did not send one:
   * `updateActionItemAction` spreads this whole object into its update, so a
   * `null` here would clear the link every time somebody edited an item from
   * the Action items tab, which has no such field.
   */
  minutes_item_key?: string;
};

export function parseActionItemForm(
  formData: FormData,
): ParseResult<ActionItemFormData> {
  const description = String(formData.get("description") ?? "").trim();
  const dueDate = String(formData.get("dueDate") ?? "").trim();
  const status = String(formData.get("status") ?? "open").trim();
  const minutesItemKey = String(formData.get("minutesItemKey") ?? "").trim();

  if (!description) return { error: "Description is required." };
  if (status !== "open" && status !== "done")
    return { error: "Invalid status." };

  return {
    data: {
      description,
      due_date: dueDate || null,
      status,
      ...(minutesItemKey ? { minutes_item_key: minutesItemKey } : {}),
    },
  };
}
