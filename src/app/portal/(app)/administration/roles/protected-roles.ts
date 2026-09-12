/**
 * What a tenant may and may not do to a role it did not create (#910).
 *
 * Two different guards, because `roles.name` and `roles.label` are two
 * different things. The label is the tenant's own wording and is editable on
 * every role, `admin` included. The name is a platform key: nineteen lines
 * across the migrations seed `role_permissions` with
 * `join roles r on r.name = '<role>'` across every tenant, so a tenant that
 * renamed `event_coordinator` to `studio_manager` would be silently skipped by
 * the next migration that seeds a permission for it.
 *
 * - `isPlatformRole` -- the five the platform seeds every tenant with
 *   (`20260821080000`). Their `name` is frozen; everything else about them,
 *   including retiring them entirely, is the tenant's call.
 * - `isProtectedRole` -- `admin` alone, which may be neither renamed nor
 *   deleted. `provision_tenant()` refuses a template tenant without one
 *   (`20260908080000`) and stages the first admin's grant against it, and
 *   every Administration screen is reached through it.
 *
 * Until this ticket both guards were the same list of five, which meant an
 * organization with no board could not retire **Board** and one that runs a
 * shop was stuck with **Event coordinator**. The real safety net for a delete
 * is the "still assigned to N users" check in `actions.ts`, not a list of
 * names.
 */
export const PLATFORM_ROLE_NAMES = [
  "admin",
  "event_coordinator",
  "finance",
  "board",
  "volunteer",
] as const;

export const PROTECTED_ROLE_NAME = "admin";

/** Seeded by the platform: its `name` is a key and can't be edited. */
export function isPlatformRole(name: string): boolean {
  return (PLATFORM_ROLE_NAMES as readonly string[]).includes(name);
}

/** Can be neither renamed nor deleted, only relabelled. */
export function isProtectedRole(name: string): boolean {
  return name === PROTECTED_ROLE_NAME;
}
