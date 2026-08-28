import type { ParseResult } from "@/lib/forms";

export type RequirementStatus = "not_started" | "in_progress" | "done";

const REQUIREMENT_STATUSES: readonly RequirementStatus[] = [
  "not_started",
  "in_progress",
  "done",
];

export type AnnualRequirementFormData = {
  name: string;
  due_date: string;
  status: RequirementStatus;
};

export function parseAnnualRequirementForm(
  formData: FormData,
): ParseResult<AnnualRequirementFormData> {
  const name = String(formData.get("name") ?? "").trim();
  const dueDate = String(formData.get("dueDate") ?? "").trim();
  const status = String(formData.get("status") ?? "not_started").trim();

  if (!name) return { error: "Name is required." };
  if (!dueDate) return { error: "Due date is required." };
  if (!REQUIREMENT_STATUSES.includes(status as RequirementStatus)) {
    return { error: "Invalid status." };
  }

  return {
    data: {
      name,
      due_date: dueDate,
      status: status as RequirementStatus,
    },
  };
}
