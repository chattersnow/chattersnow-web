import { Badge } from "@/components/ui/badge";

/**
 * The read model for a person *with* their roles (20260903030000). The four
 * role flags are derived at query time from the records that create each role,
 * unioned with person_role_tags, so they exist on this view rather than on
 * `people` -- which is still where every write goes.
 */
export const PEOPLE_WITH_ROLES = "people_with_roles";

/**
 * What kind of record this is, as opposed to what roles it holds (#625).
 * Exclusive and staff-asserted, where roles are additive and derived: it
 * decides the shape of the record -- an organization has a logo, a website, a
 * primary contact and org memberships; an individual has a rider profile.
 */
export const PERSON_TYPES = [
  { value: "individual", label: "Individual" },
  { value: "organization", label: "Organization" },
] as const;

export type PersonType = (typeof PERSON_TYPES)[number]["value"];

export function isPersonType(value: string): value is PersonType {
  return PERSON_TYPES.some((type) => type.value === value);
}

export function isOrganization(person: { person_type?: PersonType }) {
  return person.person_type === "organization";
}

export function personTypeLabel(personType: PersonType) {
  return PERSON_TYPES.find((type) => type.value === personType)?.label ?? "";
}

export type PersonSummary = {
  id: string;
  name: string | null;
  preferred_name: string | null;
  email: string | null;
  phone: string | null;
};

export type PersonRow = {
  id: string;
  name: string | null;
  preferred_name: string | null;
  email: string | null;
  phone: string | null;
  instagram_handle: string | null;
  notes: string | null;
  logo_url: string | null;
  website: string | null;
  /** The portal login this record belongs to, null when it has no account. */
  auth_user_id: string | null;
  is_donor: boolean;
  is_sponsor: boolean;
  is_volunteer: boolean;
  is_attendee: boolean;
  is_staff: boolean;
  person_type: PersonType;
  primary_contact_person_id: string | null;
  primary_contact: PersonSummary | null;
  riding_discipline: string | null;
  ski_experience_level: string | null;
  snowboard_experience_level: string | null;
  preferred_mountain: string | null;
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
  { key: "is_attendee", label: "Attendee" },
  { key: "is_staff", label: "Staff" },
] as const;

export type RoleKey = (typeof ROLE_OPTIONS)[number]["key"];

export function rolesFor(
  person: Pick<
    PersonRow,
    "is_donor" | "is_sponsor" | "is_volunteer" | "is_attendee" | "is_staff"
  >,
) {
  return ROLE_OPTIONS.filter((option) => person[option.key]).map(
    (option) => option.label,
  );
}

/**
 * Marks a person who holds a portal login account, so whoever is looking can
 * tell who can actually sign in and act on things. Lives here rather than in
 * person-picker.tsx because the person detail page shows the same badge; when
 * the picker owned it, the detail page had no way to say the same thing.
 */
export function PortalUserBadge({
  person,
}: {
  person: { auth_user_id?: string | null };
}) {
  if (!person.auth_user_id) return null;
  return (
    <Badge variant="secondary" className="shrink-0">
      Portal user
    </Badge>
  );
}
