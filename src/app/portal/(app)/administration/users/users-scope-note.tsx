import Link from "next/link";

/**
 * What this page is, said on the page (#1198).
 *
 * "Users" on its own reads as everyone with an account, and until #1191 the
 * table below made that reading true -- any signed-in constituent who opened
 * `/portal` was joined to the tenant and appeared here. The rule this line
 * states is in `docs/portal-navigation.md`: Administration answers who may act
 * on the organization's behalf, People answers who the organization knows.
 *
 * The second sentence is the half of that pair the reader cannot see from
 * here, and it only appears for a reader who can open it -- a link nobody can
 * follow is the mistake the navigation doc forbids. `constituent_claims:view`
 * carries the `constituent_accounts` module entitlement with it
 * (20260910010000), so a tenant without the constituent area shows the scope
 * sentence alone, which stands on its own.
 */
export function UsersScopeNote({
  canViewWebsiteAccounts,
}: {
  canViewWebsiteAccounts: boolean;
}) {
  return (
    <p className="app-muted mt-2 max-w-2xl text-sm">
      People who can sign in to the portal and act for the organization.
      {canViewWebsiteAccounts && (
        <>
          {" "}
          Members of the public who hold an account on the website are in{" "}
          <Link
            href="/portal/people/accounts"
            className="underline underline-offset-4"
          >
            People › Accounts
          </Link>
          .
        </>
      )}
    </p>
  );
}
