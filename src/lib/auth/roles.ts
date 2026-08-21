import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

export const PORTAL_ROLES = ["admin", "event_coordinator", "finance", "board", "volunteer"] as const;

export type PortalRole = (typeof PORTAL_ROLES)[number];

export async function getCurrentUserRoles(supabase: SupabaseClient): Promise<PortalRole[]> {
  const { data } = await supabase.rpc("my_roles");
  return (data ?? []) as PortalRole[];
}

export function hasAnyRole(roles: readonly PortalRole[], allowed: readonly PortalRole[]): boolean {
  return allowed.some((role) => roles.includes(role));
}

/**
 * Redirects to /portal/home if the signed-in user (already verified by the
 * portal layout) doesn't hold any of the allowed roles for this section.
 */
export async function requireAnyRole(
  supabase: SupabaseClient,
  allowed: readonly PortalRole[],
): Promise<PortalRole[]> {
  const roles = await getCurrentUserRoles(supabase);
  if (!hasAnyRole(roles, allowed)) {
    redirect("/portal/home");
  }
  return roles;
}
