// Where a newly provisioned tenant's first-admin invite link should land.
//
// Pure and separate so the "there is nowhere to send it" case can be tested,
// because that case is the whole point of this file. It used to abort the
// `provision` command -- but the origin is only needed *after* the tenant has
// been created, so aborting there reported a failure for work the database had
// already committed. The command now carries on without a link (#805).
//
// A link is a convenience in the first place: an address that already has an
// account claims its staged pending_role_grants row on its next portal
// navigation (resolvePermissions() in src/lib/auth/permissions.ts), and the
// link only matters for an admin who has never signed in.

/**
 * The origin to build the invite link on, or null when there is none to use.
 *
 * The tenant's own domain first -- an invite has to land on the host that
 * tenant will actually be reached at, so the session cookie is set there.
 * `NEXT_PUBLIC_SITE_URL` is the fallback for a tenant provisioned without a
 * domain, which is the normal case when the domain is set up later.
 */
export function inviteOrigin(
  domain: string | null | undefined,
  siteUrl: string | null | undefined,
): string | null {
  if (domain?.trim()) return `https://${domain.trim()}`;
  const fallback = siteUrl?.trim();
  return fallback ? fallback.replace(/\/+$/, "") : null;
}
