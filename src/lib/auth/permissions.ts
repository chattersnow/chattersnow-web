import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

export const PERMISSION_LEVELS = ["none", "view", "manage"] as const;

export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];

const LEVEL_RANK: Record<PermissionLevel, number> = {
  none: 0,
  view: 1,
  manage: 2,
};

export type PermissionMap = Record<string, PermissionLevel>;

export async function getCurrentUserPermissions(
  supabase: SupabaseClient,
): Promise<PermissionMap> {
  // Best-effort: picks up a pending_role_grants row staged after this user's
  // first login (e.g. while they were stuck with zero roles) without
  // requiring a re-login. Unlike the same call in the OAuth callback, an
  // error here must not block an already-working session on routine
  // navigation, so it's swallowed rather than surfaced.
  await supabase.rpc("claim_pending_role_grants");

  const { data } = await supabase.rpc("my_permissions");
  const map: PermissionMap = {};
  for (const row of (data ?? []) as {
    resource_key: string;
    level: PermissionLevel;
  }[]) {
    map[row.resource_key] = row.level;
  }
  return map;
}

export function hasPermission(
  permissions: PermissionMap,
  resource: string,
  minLevel: PermissionLevel = "view",
): boolean {
  return LEVEL_RANK[permissions[resource] ?? "none"] >= LEVEL_RANK[minLevel];
}

export type PermissionCheck = { resource: string; level: PermissionLevel };

export function hasAnyPermission(
  permissions: PermissionMap,
  checks: readonly PermissionCheck[],
): boolean {
  return checks.some((check) =>
    hasPermission(permissions, check.resource, check.level),
  );
}

/** Query parameter the dashboard reads to explain a denied navigation. */
export const DENIED_PARAM = "denied";

/**
 * Where a refused navigation lands. Carries the area name so the dashboard can
 * say what was refused: a bare redirect makes every shared deep link to a
 * gated section look like a broken link rather than a permissions gap.
 */
export function deniedRedirectHref(area?: string): string {
  return area
    ? `/portal/home?${DENIED_PARAM}=${encodeURIComponent(area)}`
    : `/portal/home?${DENIED_PARAM}=1`;
}

/**
 * Redirects to the dashboard if the signed-in user (already verified by the
 * portal layout) doesn't meet any of the given resource/level checks.
 *
 * `area` is the human name of what was refused ("Finance", "Audit log") and is
 * passed through to the dashboard so the user is told, rather than silently
 * relocated.
 */
export async function requireAnyPermission(
  supabase: SupabaseClient,
  checks: readonly PermissionCheck[],
  area?: string,
): Promise<PermissionMap> {
  const permissions = await getCurrentUserPermissions(supabase);
  if (!hasAnyPermission(permissions, checks)) {
    redirect(deniedRedirectHref(area));
  }
  return permissions;
}

export async function requirePermission(
  supabase: SupabaseClient,
  resource: string,
  level: PermissionLevel = "view",
  area?: string,
): Promise<PermissionMap> {
  return requireAnyPermission(supabase, [{ resource, level }], area);
}

export type PermissionDenied = { error: string };

const DEFAULT_DENIED_MESSAGE =
  "You don't have permission to perform this action.";

/**
 * Server Action variant of requireAnyPermission: returns { error } instead of
 * redirecting, since a Server Action must surface a failure as an inline
 * result the client can show, not a navigation. Returns null when the check
 * passes.
 */
export async function checkAnyPermission(
  supabase: SupabaseClient,
  checks: readonly PermissionCheck[],
  message: string = DEFAULT_DENIED_MESSAGE,
): Promise<PermissionDenied | null> {
  const permissions = await getCurrentUserPermissions(supabase);
  return hasAnyPermission(permissions, checks) ? null : { error: message };
}

export async function checkPermission(
  supabase: SupabaseClient,
  resource: string,
  level: PermissionLevel = "view",
  message?: string,
): Promise<PermissionDenied | null> {
  return checkAnyPermission(supabase, [{ resource, level }], message);
}
