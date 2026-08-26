import type { ParseResult } from "@/lib/forms";

export type GearRequestFormData = {
  name: string;
  email: string;
  phone: string | null;
  notes: string | null;
};

export function parseGearRequestForm(
  formData: FormData,
): ParseResult<GearRequestFormData> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!name) return { error: "Name is required." };
  if (!email || !email.includes("@"))
    return { error: "A valid email is required." };

  return {
    data: {
      name,
      email,
      phone: phone || null,
      notes: notes || null,
    },
  };
}
