import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

export const PERMISSION_LEVELS = ["none", "view", "manage"] as const;

export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];

const LEVEL_RANK: Record<PermissionLevel, number> = { none: 0, view: 1, manage: 2 };

export type PermissionMap = Record<string, PermissionLevel>;

export async function getCurrentUserPermissions(supabase: SupabaseClient): Promise<PermissionMap> {
  const { data } = await supabase.rpc("my_permissions");
  const map: PermissionMap = {};
  for (const row of (data ?? []) as { resource_key: string; level: PermissionLevel }[]) {
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
  return checks.some((check) => hasPermission(permissions, check.resource, check.level));
}

/**
 * Redirects to /portal/home if the signed-in user (already verified by the
 * portal layout) doesn't meet any of the given resource/level checks.
 */
export async function requireAnyPermission(
  supabase: SupabaseClient,
  checks: readonly PermissionCheck[],
): Promise<PermissionMap> {
  const permissions = await getCurrentUserPermissions(supabase);
  if (!hasAnyPermission(permissions, checks)) {
    redirect("/portal/home");
  }
  return permissions;
}

export async function requirePermission(
  supabase: SupabaseClient,
  resource: string,
  level: PermissionLevel = "view",
): Promise<PermissionMap> {
  return requireAnyPermission(supabase, [{ resource, level }]);
}

export type PermissionDenied = { error: string };

const DEFAULT_DENIED_MESSAGE = "You don't have permission to perform this action.";

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
