export type ParseResult<T> = { data: T } | { error: string };

export type PersonFormData = {
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  is_donor: boolean;
  is_sponsor: boolean;
  is_volunteer: boolean;
};

export function parsePersonForm(formData: FormData): ParseResult<PersonFormData> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const is_donor = formData.get("isDonor") === "true";
  const is_sponsor = formData.get("isSponsor") === "true";
  const is_volunteer = formData.get("isVolunteer") === "true";

  if (!name) return { error: "Name is required." };
  if (!is_donor && !is_sponsor && !is_volunteer) {
    return { error: "Select at least one role." };
  }

  return {
    data: {
      name,
      email: email || null,
      phone: phone || null,
      notes: notes || null,
      is_donor,
      is_sponsor,
      is_volunteer,
    },
  };
}
