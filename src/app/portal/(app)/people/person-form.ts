import type { ParseResult } from "@/lib/forms";

const INSTAGRAM_HANDLE_PATTERN = /^[A-Za-z0-9._]{1,30}$/;

export type PersonFormData = {
  name: string;
  email: string | null;
  phone: string | null;
  instagram_handle: string | null;
  notes: string | null;
  logo_url: string | null;
  website: string | null;
  is_donor: boolean;
  is_sponsor: boolean;
  is_volunteer: boolean;
  is_organization: boolean;
  is_attendee: boolean;
};

export function parsePersonForm(
  formData: FormData,
): ParseResult<PersonFormData> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const instagramHandle = String(formData.get("instagramHandle") ?? "")
    .trim()
    .replace(/^@/, "");
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
  const is_organization =
    formData.get("isOrganization") === "on" ||
    formData.get("isOrganization") === "true";
  const is_attendee =
    formData.get("isAttendee") === "on" ||
    formData.get("isAttendee") === "true";

  if (!name) return { error: "Name is required." };
  if (!is_donor && !is_sponsor && !is_volunteer && !is_attendee) {
    return { error: "Select at least one role." };
  }
  if (instagramHandle && !INSTAGRAM_HANDLE_PATTERN.test(instagramHandle)) {
    return {
      error:
        "Instagram handle can only contain letters, numbers, periods, and underscores.",
    };
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
      instagram_handle: instagramHandle || null,
      notes: notes || null,
      logo_url: logoUrl || null,
      website: website || null,
      is_donor,
      is_sponsor,
      is_volunteer,
      is_organization,
      is_attendee,
    },
  };
}
