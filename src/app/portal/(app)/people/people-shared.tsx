export type PersonSummary = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

export type PersonRow = {
  id: string;
  name: string | null;
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
  primary_contact_person_id: string | null;
  primary_contact: PersonSummary | null;
};

export type OrganizationMembership = {
  id: string;
  organization: PersonSummary;
  person: PersonSummary;
  role: string | null;
  is_primary: boolean;
};

export const ROLE_OPTIONS = [
  { key: "is_donor", label: "Donor" },
  { key: "is_sponsor", label: "Sponsor" },
  { key: "is_volunteer", label: "Volunteer" },
] as const;

export type RoleKey = (typeof ROLE_OPTIONS)[number]["key"];

export function rolesFor(
  person: Pick<PersonRow, "is_donor" | "is_sponsor" | "is_volunteer">,
) {
  return ROLE_OPTIONS.filter((option) => person[option.key]).map(
    (option) => option.label,
  );
}
