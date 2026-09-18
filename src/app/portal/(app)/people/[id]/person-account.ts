import type { PortalUser } from "../../administration/users/users-shared";

export type PersonAccount = {
  user_id: string;
  email: string | null;
  roles: string[];
  created_at: string | null;
  deactivated_at: string | null;
  /**
   * Which read this came from (#1193). `administration` is `list_portal_users()`
   * and carries roles and the account's dates; `directory` is the person row
   * itself, which is all a claims reviewer can see -- an account's sign-in
   * address and nothing else. The card renders less rather than guessing.
   */
  source: "administration" | "directory";
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
        source: "administration",
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

/**
 * The account as the directory itself knows it (#1193).
 *
 * `resolvePersonAccount` above is fed by `listUsersAction()`, which is gated on
 * `administration:manage` and degrades to an empty list for everyone else -- so
 * a claims reviewer opening a person record would be told there was no account
 * at all, which is the opposite of the truth and the reason they opened the
 * page. `people_with_roles` carries `auth_user_id` and, for a reader with
 * `constituent_claims:view`, `account_email` (20260916150000), which is enough
 * to say that an account exists, name it, and offer to unlink it.
 */
export function directoryPersonAccount(person: {
  auth_user_id: string | null;
  account_email?: string | null;
}): PersonAccount | null {
  if (!person.auth_user_id) return null;
  return {
    user_id: person.auth_user_id,
    email: person.account_email ?? null,
    roles: [],
    created_at: null,
    deactivated_at: null,
    source: "directory",
  };
}
