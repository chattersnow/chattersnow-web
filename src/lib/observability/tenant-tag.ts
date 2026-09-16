import * as Sentry from "@sentry/nextjs";

/**
 * Tags every Sentry event from this request with the tenant it was serving
 * (#1195, #1210).
 *
 * On a shared deployment one tenant's noise is otherwise unfilterable. The
 * request host is on an event as `url`, but that is a saved search per host
 * rather than a field to group or filter by, and it drifts the moment a tenant
 * changes its `custom_domain`.
 *
 * `Sentry.setTag` writes to the *isolation scope*, which the Next.js SDK forks
 * per request -- which is why this is called from the per-request tenant reads
 * rather than from an `init`, where no tenant is known yet. For the same reason
 * this belongs on the server only: in the browser the isolation scope is
 * effectively global, so a call there would leave a stale tag on every later
 * event. It carries no `server-only` marker because the two callers are read by
 * unit tests that run outside a React Server Component, where that marker
 * throws -- keep the callers server-side instead.
 *
 * A missing slug is a no-op rather than a null tag -- an event with no `tenant`
 * reads as "no tenant resolved", which is the truth in that case.
 */
export function tagTenant(slug: string | null | undefined): void {
  if (slug) Sentry.setTag("tenant", slug);
}
