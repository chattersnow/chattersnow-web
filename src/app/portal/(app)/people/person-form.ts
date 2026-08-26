import type { ParseResult } from "@/lib/forms";

export type PersonFormData = {
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  logo_url: string | null;
  website: string | null;
  is_donor: boolean;
  is_sponsor: boolean;
  is_volunteer: boolean;
};

export function parsePersonForm(
  formData: FormData,
): ParseResult<PersonFormData> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const logoUrl = String(formData.get("logoUrl") ?? "").trim();
  const website = String(formData.get("website") ?? "").trim();
  const is_donor =
    formData.get("isDonor") === "on" || formData.get("isDonor") === "true";
  const is_sponsor =
    formData.get("isSponsor") === "on" || formData.get("isSponsor") === "true";
  const is_volunteer =
    formData.get("isVolunteer") === "on" ||
    formData.get("isVolunteer") === "true";

  if (!name) return { error: "Name is required." };
  if (!is_donor && !is_sponsor && !is_volunteer) {
    return { error: "Select at least one role." };
  }
  if (logoUrl && !/^https?:\/\//i.test(logoUrl)) {
    return { error: "Logo URL must start with http:// or https://." };
  }
  if (website && !/^https?:\/\//i.test(website)) {
    return { error: "Website must start with http:// or https://." };
  }

  return {
    data: {
      name,
      email: email || null,
      phone: phone || null,
      notes: notes || null,
      logo_url: logoUrl || null,
      website: website || null,
      is_donor,
      is_sponsor,
      is_volunteer,
    },
  };
}
