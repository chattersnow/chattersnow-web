import type { ParseResult } from "@/lib/forms";

export type DonationEditFormData = {
  /** "YYYY-MM-DD" for the `date` column, bound straight through from the
   *  `<input type="date">` (#1053). Parsing it into a `Date` on the way past
   *  is what used to turn it into UTC midnight and read back a day early. */
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

  if (!/^\d{4}-\d{2}-\d{2}$/.test(donatedAtRaw)) {
    return { error: "Enter a valid date received." };
  }

  return {
    data: {
      donated_at: donatedAtRaw,
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  };
}
