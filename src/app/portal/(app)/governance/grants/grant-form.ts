import type { ParseResult } from "@/lib/forms";

export type GrantStatus = "planned" | "submitted" | "awarded" | "declined";

export const GRANT_STATUSES: readonly GrantStatus[] = [
  "planned",
  "submitted",
  "awarded",
  "declined",
];

export const OPEN_GRANT_STATUSES: readonly GrantStatus[] = [
  "planned",
  "submitted",
];

export type GrantFormData = {
  funder_name: string;
  amount: number | null;
  application_deadline: string;
  status: GrantStatus;
  notes: string | null;
};

export function parseGrantForm(formData: FormData): ParseResult<GrantFormData> {
  const funderName = String(formData.get("funderName") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const applicationDeadline = String(
    formData.get("applicationDeadline") ?? "",
  ).trim();
  const status = String(formData.get("status") ?? "planned").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!funderName) return { error: "Funder name is required." };
  if (!applicationDeadline)
    return { error: "Application deadline is required." };
  if (!GRANT_STATUSES.includes(status as GrantStatus)) {
    return { error: "Invalid status." };
  }

  let amount: number | null = null;
  if (amountRaw) {
    amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount < 0) {
      return { error: "Amount must be a positive number." };
    }
  }

  return {
    data: {
      funder_name: funderName,
      amount,
      application_deadline: applicationDeadline,
      status: status as GrantStatus,
      notes: notes || null,
    },
  };
}
