import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import {
  listRolesAction,
  listUsersAction,
} from "../../administration/users/actions";
import { roleLabelMap } from "@/lib/format";
import type { PersonListItem } from "../actions";
import {
  isOrganization,
  type OrganizationMembership,
  type PersonRow,
} from "../people-shared";
import { AccountCard } from "./account-card";
import { MergeCard } from "./merge-card";
import { OrganizationsCard } from "./organizations-card";
import { ProfileCard } from "./profile-card";
import { PublicTeamCard, type PublicTeamMembership } from "./public-team-card";
import { resolvePersonAccount } from "./person-account";

/**
 * The cards that belong to the person rather than to any one role: their
 * profile, their organization links, and the portal account behind the record.
 *
 * Grouped into one component so the page body awaits only the person row. Left
 * inline, these queries would resolve before the aspect cards were even
 * invoked, adding a whole wave to the request.
 */
export async function PersonCoreCards({ person }: { person: PersonRow }) {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "people", "manage");
  // A rider profile deletion request reaches whoever is running the event as
  // often as it reaches the directory, and a lead working the door holds
  // events:manage without necessarily holding people:manage (#602). Matches the
  // gate on delete_rider_profile itself.
  const canDeleteRiderProfile =
    canManage || hasPermission(permissions, "events", "manage");
  const canManageAccounts = hasPermission(
    permissions,
    "administration",
    "manage",
  );

  const portalUsersPromise = canManageAccounts
    ? listUsersAction()
    : Promise.resolve(null);
  // list_portal_users() reports role *names*; the account card renders the
  // tenant's own wording for them (#910).
  const rolesPromise = canManageAccounts
    ? listRolesAction()
    : Promise.resolve(null);

  const [{ data: peopleOptions }, { data: memberships }, { data: publicTeam }] =
    await Promise.all([
      supabase
        .from("people")
        .select(
          "id, name, preferred_name, email, phone, person_type, auth_user_id",
        )
        .neq("id", person.id)
        .order("name", { ascending: true }),
      supabase
        .from("person_organizations")
        .select(
          "id, role, is_primary, organization:people!person_organizations_organization_id_fkey(id, name, preferred_name, email, phone), person:people!person_organizations_person_id_fkey(id, name, preferred_name, email, phone)",
        )
        .eq(
          isOrganization(person) ? "organization_id" : "person_id",
          person.id,
        ),
      // The public team page is a page of people, so an organization has no
      // listing to show and the card is not rendered for one below (#1014).
      isOrganization(person)
        ? Promise.resolve({ data: null })
        : supabase
            .from("public_team_members")
            .select("id, public_role, photo_url, bio, sort_order")
            .eq("person_id", person.id)
            .maybeSingle(),
    ]);

  const peopleOptionRows = (peopleOptions ?? []) as unknown as PersonListItem[];
  const membershipRows = (memberships ??
    []) as unknown as OrganizationMembership[];
  const publicTeamMembership = (publicTeam ??
    null) as PublicTeamMembership | null;

  const [portalUsers, roles] = await Promise.all([
    portalUsersPromise,
    rolesPromise,
  ]);
  const roleLabels = roleLabelMap(roles && "data" in roles ? roles.data : []);
  const { account, linkable } = resolvePersonAccount(
    person.id,
    person.email,
    portalUsers && "data" in portalUsers ? portalUsers.data : [],
  );

  return (
    <>
      <ProfileCard
        person={person}
        people={peopleOptionRows}
        canManage={canManage}
        canDeleteRiderProfile={canDeleteRiderProfile}
      />

      <OrganizationsCard
        personId={person.id}
        isOrganization={isOrganization(person)}
        memberships={membershipRows}
        people={peopleOptionRows}
        canManage={canManage}
      />

      {!isOrganization(person) && (
        <PublicTeamCard
          personId={person.id}
          personName={person.name}
          membership={publicTeamMembership}
          canManage={canManage}
        />
      )}

      {canManage && (
        <MergeCard personId={person.id} people={peopleOptionRows} />
      )}

      {canManageAccounts && (
        <AccountCard
          personId={person.id}
          account={account}
          linkable={linkable}
          roleLabels={roleLabels}
        />
      )}
    </>
  );
}
