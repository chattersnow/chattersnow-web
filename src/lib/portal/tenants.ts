import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A tenant the signed-in user may act inside. Name and slug only -- status,
 * plan and custom_domain are platform concerns the portal shell has no use
 * for, and Phase 4 reads them server-side when it resolves a host.
 */
export type Tenant = {
  id: string;
  name: string;
  slug: string;
};

export type TenantContext = {
  /** Every tenant the user holds a live membership in, name-sorted. */
  tenants: Tenant[];
  /**
   * The tenant this request is scoped to, or null when the user belongs to
   * none (a fresh account on a multi-tenant database) or holds several and
   * has not chosen one yet.
   */
  currentTenantId: string | null;
};

const EMPTY: TenantContext = { tenants: [], currentTenantId: null };

/**
 * Memoized per Supabase client for the same reason as
 * `getCurrentUserPermissions` in `src/lib/auth/permissions.ts`: one client per
 * request, so this keys cleanly to a request, and a WeakMap holds nothing
 * between them.
 */
const contextByClient = new WeakMap<SupabaseClient, Promise<TenantContext>>();

export async function getTenantContext(
  supabase: SupabaseClient,
): Promise<TenantContext> {
  const cached = contextByClient.get(supabase);
  if (cached) return cached;

  const pending = resolveTenantContext(supabase);
  contextByClient.set(supabase, pending);
  try {
    return await pending;
  } catch {
    // Don't pin a rejection to the client for the rest of the request, and
    // don't take the portal shell down over it -- the switcher is chrome.
    contextByClient.delete(supabase);
    return EMPTY;
  }
}

async function resolveTenantContext(
  supabase: SupabaseClient,
): Promise<TenantContext> {
  // Joins a brand-new account to the tenant before anything reads it, the
  // same best-effort shape as the claim_pending_role_grants() call in
  // resolvePermissions(). The RPC only auto-joins when the database holds
  // exactly one active tenant, so it is a no-op the moment there is a second.
  await supabase.rpc("ensure_tenant_membership");

  const [tenantsResult, currentResult] = await Promise.all([
    // No filter needed: the `tenants select` policy (20260905180000) already
    // scopes this to my_tenant_ids(), which excludes expired support grants
    // and suspended tenants.
    supabase.from("tenants").select("id, name, slug").order("name"),
    supabase.rpc("current_tenant_id"),
  ]);

  if (tenantsResult.error) return EMPTY;

  return {
    tenants: (tenantsResult.data ?? []) as Tenant[],
    currentTenantId: currentResult.error
      ? null
      : ((currentResult.data as string | null) ?? null),
  };
}

/** The tenant a request is scoped to, or null. */
export function currentTenant(context: TenantContext): Tenant | null {
  return (
    context.tenants.find((tenant) => tenant.id === context.currentTenantId) ??
    null
  );
}
