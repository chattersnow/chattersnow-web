import type { ParseResult } from "@/lib/forms";

export type MilestoneStatus = "not_started" | "in_progress" | "done";

const MILESTONE_STATUSES: readonly MilestoneStatus[] = [
  "not_started",
  "in_progress",
  "done",
];

export type MilestoneFormData = {
  description: string;
  phase: string;
  status: MilestoneStatus;
  due_date: string | null;
};

export function parseMilestoneForm(
  formData: FormData,
): ParseResult<MilestoneFormData> {
  const description = String(formData.get("description") ?? "").trim();
  const phase = String(formData.get("phase") ?? "").trim();
  const status = String(formData.get("status") ?? "not_started").trim();
  const dueDate = String(formData.get("dueDate") ?? "").trim();

  if (!description) return { error: "Description is required." };
  if (!phase) return { error: "Phase is required." };
  if (!MILESTONE_STATUSES.includes(status as MilestoneStatus)) {
    return { error: "Invalid status." };
  }

  return {
    data: {
      description,
      phase,
      status: status as MilestoneStatus,
      due_date: dueDate || null,
    },
  };
}
