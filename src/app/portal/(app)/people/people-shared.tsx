import { Badge } from "@/components/ui/badge";
import type { Lexicon } from "@/lib/lexicon";
import {
  PERSON_ROLES,
  personRoleLabel,
  type PersonRoleDefinition,
  type PersonRoleKey,
} from "@/lib/person-roles";

/**
 * The read model for a person *with* their roles (20260903030000). The role
 * flags are derived at query time from the records that create each role,
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
  /** Where their portal mail goes instead of `email`, when set (#1042). */
  notification_email: string | null;
  /** Asked for but not yet confirmed, so nothing is sent there yet (#1049). */
  notification_email_pending: string | null;
  phone: string | null;
  pronouns: string | null;
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
  is_partner: boolean;
  is_recipient: boolean;
  person_type: PersonType;
  primary_contact_person_id: string | null;
  primary_contact: PersonSummary | null;
  riding_discipline: string | null;
  ski_experience_level: string | null;
  snowboard_experience_level: string | null;
  preferred_mountain: string | null;
  /** The postal address (#1164), which the person may also correct themselves. */
  address_line1: string | null;
  address_line2: string | null;
  address_city: string | null;
  address_region: string | null;
  address_postal_code: string | null;
  address_country: string | null;
};

export type OrganizationMembership = {
  id: string;
  organization: PersonSummary;
  person: PersonSummary;
  role: string | null;
  is_primary: boolean;
};

/**
 * The role a person holds, as the schema names it. The *words* for these are
 * the tenant's (#911) and live in `src/lib/person-roles.ts`; the key is what
 * the view, the routes and `person_role_tags` are written against.
 */
export type RoleKey = PersonRoleKey;

/**
 * The roles this list is willing to name, which is every role but Recipient
 * (#1073).
 *
 * Two reasons, and the narrower one is not the privacy one. The flag comes
 * from `person_role_flags()`, which is `security definer` and so bypasses RLS;
 * the rows behind it -- `inventory_movements`, `gear_requests` -- are gated on
 * `inventory:view`. So a Recipient chip would be legible to every holder of
 * `people:view`, which the nav's own comment notes "is held by almost
 * everyone", while the distributions it describes would not be. The label
 * would leak more than the data.
 *
 * The wider reason is what a column does that a card does not. The Roles
 * column renders across a browsable, searchable directory, so a chip there
 * assembles a roster of aid recipients out of a list nobody asked for one
 * from -- the segment #1073 explicitly declined, arrived at from the side.
 * The aspect card discloses the same fact to a staffer who already has one
 * person's record open for a reason, which is the disclosure that was asked
 * for.
 *
 * Recipient is still in `PERSON_ROLES`: the person form offers it, the admin
 * panel renames it, and the aspect registry keys its card on it. This list is
 * the one surface that declines it.
 */
const LISTED_ROLES: readonly PersonRoleDefinition[] = PERSON_ROLES.filter(
  (role) => role.key !== "is_recipient",
);

/**
 * The roles a person holds, in the tenant's words, in registry order -- for
 * the Roles column and the badges on their profile. See `LISTED_ROLES` for the
 * one it leaves out.
 */
export function rolesFor(
  // Every flag, including the one this declines to name: the callers hand over
  // a whole `people_with_roles` row, and which of them reach the screen is this
  // function's decision rather than something a caller can be trusted to make
  // consistently at four call sites.
  person: Pick<PersonRow, PersonRoleKey>,
  vocabulary: Lexicon,
) {
  return LISTED_ROLES.filter((role) => person[role.key]).map((role) =>
    personRoleLabel(role.key, vocabulary),
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
