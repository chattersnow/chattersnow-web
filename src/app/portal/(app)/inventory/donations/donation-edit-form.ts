import type { ParseResult } from "@/lib/forms";

export type DonationEditFormData = {
  donated_at: string;
  notes: string | null;
};

export function parseDonationEditForm(
  formData: FormData,
): ParseResult<DonationEditFormData> {
  const donatedAtRaw = String(formData.get("donatedAt") ?? "").trim();
  if (!donatedAtRaw) {
    return { error: "Date received is required." };
  }

  const donatedAt = new Date(donatedAtRaw);
  if (Number.isNaN(donatedAt.getTime())) {
    return { error: "Enter a valid date received." };
  }

  return {
    data: {
      donated_at: donatedAt.toISOString(),
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  };
}
