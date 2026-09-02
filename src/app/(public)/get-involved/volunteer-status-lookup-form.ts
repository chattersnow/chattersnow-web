import type { ParseResult } from "@/lib/forms";

export type VolunteerStatusLookupFormData = {
  email: string;
  referenceCode: string;
};

export function parseVolunteerStatusLookupForm(
  formData: FormData,
): ParseResult<VolunteerStatusLookupFormData> {
  const email = String(formData.get("email") ?? "").trim();
  const referenceCode = String(formData.get("referenceCode") ?? "").trim();

  if (!email || !email.includes("@"))
    return { error: "A valid email is required." };
  if (!referenceCode) return { error: "Reference code is required." };

  return { data: { email, referenceCode } };
}

// Internal statuses (application-types.ts) are never shown to applicants
// as-is -- map each to an applicant-facing label instead.
export function mapVolunteerApplicationStatusToLabel(status: string): string {
  switch (status) {
    case "new":
      return "Received";
    case "being reviewed":
    case "contacted":
      return "In review";
    case "placed":
      return "Placed";
    case "declined":
    case "closed":
      return "Not moving forward at this time";
    default:
      return "In review";
  }
}
