import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { listUsersAction } from "../../administration/users/actions";
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
  const canManageAccounts = hasPermission(
    permissions,
    "administration",
    "manage",
  );

  const portalUsersPromise = canManageAccounts
    ? listUsersAction()
    : Promise.resolve(null);

  const [{ data: peopleOptions }, { data: memberships }] = await Promise.all([
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
        "id, role, is_primary, organization:people!organization_id(id, name, preferred_name, email, phone), person:people!person_id(id, name, preferred_name, email, phone)",
      )
      .eq(isOrganization(person) ? "organization_id" : "person_id", person.id),
  ]);

  const peopleOptionRows = (peopleOptions ?? []) as unknown as PersonListItem[];
  const membershipRows = (memberships ??
    []) as unknown as OrganizationMembership[];

  const portalUsers = await portalUsersPromise;
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
      />

      <OrganizationsCard
        personId={person.id}
        isOrganization={isOrganization(person)}
        memberships={membershipRows}
        people={peopleOptionRows}
        canManage={canManage}
      />

      {canManage && (
        <MergeCard personId={person.id} people={peopleOptionRows} />
      )}

      {canManageAccounts && (
        <AccountCard
          personId={person.id}
          account={account}
          linkable={linkable}
        />
      )}
    </>
  );
}
