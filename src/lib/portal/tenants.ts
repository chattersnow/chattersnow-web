import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublicTenant, type PublicTenant } from "@/lib/branding";

/**
 * A tenant the signed-in user may act inside. Status is a platform concern the
 * portal shell has no use for.
 *
 * `plan` is here for one reason: the shell has to say out loud when someone is
 * inside the public demo (#604), and the demo is `plan = 'demo'`. Comparing
 * the slug would be wrong -- a slug is a free choice at provisioning time,
 * while `plan` is a constrained enum on the tenants table and the same value
 * `seed_demo_tenant()` and the reset script refuse to act without.
 *
 * `custom_domain` is what `resolve_tenant_id_from_host()` matches a request
 * host against in the database, and it used to be deliberately withheld from
 * the client for that reason. #956 gives the shell a use for it that the
 * database cannot serve: when an account lands on a host belonging to an
 * organization it is not in, the only useful thing to offer is a link to the
 * host of one it *is* in. Reading it grants nothing -- the `tenants select`
 * policy already scopes every row here to `my_tenant_ids()`.
 */
export type Tenant = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  custom_domain: string | null;
};

/**
 * Whether this tenant is the public demo anyone can sign into.
 *
 * Takes anything carrying a plan rather than a full `Tenant`: the portal login
 * asks this about a `PublicTenant` -- the tenant the request *host* resolves to
 * -- before any session exists, which is how the demo button stays on the demo
 * tenant's host alone.
 */
export function isDemoTenant(tenant: Pick<Tenant, "plan"> | null): boolean {
  return tenant?.plan === "demo";
}

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
   * The tenant the request *host* belongs to, when it belongs to one (#956).
   *
   * Null covers both "no tenant claims this host" and "the read failed", and
   * they are deliberately not told apart here, because the one caller acts the
   * same way on both: it enforces nothing and renders the shell. An unresolved
   * host is a local run, a preview or a domain whose tenant row does not exist
   * yet; a failed read is a database blip. Refusing a legitimate member over
   * either would be worse than serving them the portal they asked for.
   */
  hostTenant: PublicTenant | null;
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
  hostTenant: null,
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
  // same best-effort shape as in resolvePermissions(). The first RPC
  // auto-joins the tenant the request host resolves to, else the sole active
  // tenant, and never an account that already holds a membership anywhere.
  //
  // The claim has to happen here too, not only in resolvePermissions(), and
  // #956 is what made that load-bearing. Provisioning stages the first admin
  // as a `pending_role_grants` row, and the membership only appears when that
  // row is claimed -- so with the claim left downstream, the very first person
  // to open a newly provisioned tenant's portal would be told they are not a
  // member of it, on the tenant's own domain, and be refused before reaching
  // the call that would have made them one. Both are idempotent; claiming
  // twice in a request costs a no-op round trip and nothing else.
  await Promise.all([
    supabase.rpc("ensure_tenant_membership"),
    supabase.rpc("claim_pending_role_grants"),
  ]);

  const [tenantsResult, currentResult, hostResult] = await Promise.all([
    // No filter needed: the `tenants select` policy (20260905180000) already
    // scopes this to my_tenant_ids(), which excludes expired support grants
    // and suspended tenants.
    supabase
      .from("tenants")
      .select("id, name, slug, plan, custom_domain")
      .order("name"),
    supabase.rpc("current_tenant_id"),
    // Read here rather than in the layout so the whole "which tenant is this
    // request about" question stays one memoized round of queries per request.
    getPublicTenant(supabase),
  ]);

  if (tenantsResult.error) return UNRESOLVED;

  return {
    tenants: (tenantsResult.data ?? []) as Tenant[],
    currentTenantId: currentResult.error
      ? null
      : ((currentResult.data as string | null) ?? null),
    hostTenant: hostResult.status === "resolved" ? hostResult.tenant : null,
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

/**
 * What the request host has to say about which tenant this session is in
 * (#956): one host, one tenant.
 *
 * Until #956 the portal ignored the host entirely -- `current_tenant_id()` is
 * membership-based and nothing else -- so any tenant's portal rendered on any
 * tenant's domain. RLS held throughout (an account only ever saw the tenant it
 * belonged to), but the public demo host would happily serve a paying tenant's
 * operations portal to whoever signed in there.
 *
 * The decision lives here, as a pure function of the context, for two reasons:
 * it is the ordering that is easy to get wrong -- see `refuse` below -- and
 * the layout that acts on it is 300 lines of shell it would otherwise hide in.
 */
export type HostTenantDecision =
  /** Nothing to enforce: no tenant claims this host, the read failed, or the
   *  account belongs to no tenant at all (NoTenant explains that better). */
  | { kind: "unenforced" }
  /**
   * This host belongs to an organization the account is not in. Must be
   * checked *before* the "choose an organization" branch: a member of A and B
   * looking at C's host has a null `currentTenantId`, so ChooseTenant would
   * otherwise offer them A, accept the choice, re-render, and offer it again
   * forever.
   */
  | { kind: "refuse"; hostTenant: PublicTenant }
  /** A member of this host's tenant whose selection points somewhere else. */
  | { kind: "align"; hostTenant: PublicTenant }
  /** A member of this host's tenant, already scoped to it. */
  | { kind: "pinned"; hostTenant: PublicTenant };

export function decideHostTenant(context: TenantContext): HostTenantDecision {
  const hostTenant = context.hostTenant;
  if (!context.resolved || !hostTenant || context.tenants.length === 0) {
    return { kind: "unenforced" };
  }
  if (!context.tenants.some((tenant) => tenant.id === hostTenant.id)) {
    return { kind: "refuse", hostTenant };
  }
  return context.currentTenantId === hostTenant.id
    ? { kind: "pinned", hostTenant }
    : { kind: "align", hostTenant };
}
