import type { ParseResult } from "@/lib/forms";

export type VolunteerApplicationFormData = {
  name: string;
  email: string;
  phone: string | null;
  role_interest: string | null;
  availability: string | null;
};

export function parseVolunteerApplicationForm(
  formData: FormData,
): ParseResult<VolunteerApplicationFormData> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const roleInterest = String(formData.get("roleInterest") ?? "").trim();
  const availability = String(formData.get("availability") ?? "").trim();

  if (!name) return { error: "Name is required." };
  if (!email || !email.includes("@"))
    return { error: "A valid email is required." };
  if (name.length > 200) return { error: "Name is too long." };
  if (availability.length > 2000) return { error: "Notes are too long." };

  return {
    data: {
      name,
      email,
      phone: phone || null,
      role_interest: roleInterest || null,
      availability: availability || null,
    },
  };
}
