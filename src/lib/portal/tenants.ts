import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A tenant the signed-in user may act inside. Name and slug only -- status,
 * plan and custom_domain are platform concerns the portal shell has no use
 * for; custom_domain is what `public_tenant_id()` resolves a request host
 * against in the database, never the client.
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
  /**
   * Whether the read actually succeeded.
   *
   * Without this, an empty `tenants` means both "this account belongs to no
   * tenant" and "the database did not answer" -- and the caller acts on the
   * difference: the first is a real state to explain, the second is a
   * transient failure that must not tell a legitimate member they were never
   * added to anything.
   */
  resolved: boolean;
};

const UNRESOLVED: TenantContext = {
  tenants: [],
  currentTenantId: null,
  resolved: false,
};

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

  // resolveTenantContext settles rather than rejecting, so the memoized
  // promise is safe to hand to a second caller in the same request -- a
  // rejection cached here would surface to whichever caller arrived after it.
  const pending = resolveTenantContext(supabase);
  contextByClient.set(supabase, pending);
  return pending;
}

async function resolveTenantContext(
  supabase: SupabaseClient,
): Promise<TenantContext> {
  try {
    return await readTenantContext(supabase);
  } catch {
    // A thrown fetch (the network, not PostgREST) lands here.
    return UNRESOLVED;
  }
}

async function readTenantContext(
  supabase: SupabaseClient,
): Promise<TenantContext> {
  // Joins a brand-new account to the tenant before anything reads it, the
  // same best-effort shape as the claim_pending_role_grants() call in
  // resolvePermissions(). The RPC auto-joins the tenant the request host
  // resolves to, else the sole active tenant, and never an account that
  // already holds a membership anywhere.
  await supabase.rpc("ensure_tenant_membership");

  const [tenantsResult, currentResult] = await Promise.all([
    // No filter needed: the `tenants select` policy (20260905180000) already
    // scopes this to my_tenant_ids(), which excludes expired support grants
    // and suspended tenants.
    supabase.from("tenants").select("id, name, slug").order("name"),
    supabase.rpc("current_tenant_id"),
  ]);

  if (tenantsResult.error) return UNRESOLVED;

  return {
    tenants: (tenantsResult.data ?? []) as Tenant[],
    currentTenantId: currentResult.error
      ? null
      : ((currentResult.data as string | null) ?? null),
    resolved: true,
  };
}

/** The tenant a request is scoped to, or null. */
export function currentTenant(context: TenantContext): Tenant | null {
  return (
    context.tenants.find((tenant) => tenant.id === context.currentTenantId) ??
    null
  );
}
