import type { PortalUser } from "../../administration/users/users-shared";

export type PersonAccount = {
  user_id: string;
  email: string | null;
  roles: string[];
  created_at: string;
  deactivated_at: string | null;
};

export type LinkableAccount = { user_id: string; email: string };

/**
 * Splits the admin portal-user list into "the account already linked to this
 * person" and "accounts that look like they should be". Pure so it can be
 * unit-tested without a Supabase stack; the detail page feeds it
 * listUsersAction()'s rows, which are already gated on administration:manage.
 */
export function resolvePersonAccount(
  personId: string,
  personEmail: string | null,
  users: PortalUser[],
): { account: PersonAccount | null; linkable: LinkableAccount[] } {
  const linked = users.find((user) => user.person_id === personId);
  if (linked) {
    return {
      account: {
        user_id: linked.user_id,
        email: linked.email,
        roles: linked.roles,
        created_at: linked.created_at,
        deactivated_at: linked.deactivated_at,
      },
      linkable: [],
    };
  }

  // Only offer accounts that aren't already claimed by another person -- the
  // RPC rejects those anyway (people_auth_user_id_key), so surfacing them
  // would just be a button that always errors.
  const email = personEmail?.trim().toLowerCase();
  const linkable = !email
    ? []
    : users
        .filter(
          (user) =>
            user.person_id === null &&
            user.email !== null &&
            user.email.toLowerCase() === email,
        )
        .map((user) => ({
          user_id: user.user_id,
          email: user.email as string,
        }));

  return { account: null, linkable };
}
