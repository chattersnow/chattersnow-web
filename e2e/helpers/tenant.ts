import { createAdminClient } from "./admin-client";

/**
 * The tenant a local or CI database bootstraps as.
 *
 * Resolved by age rather than by slug. `20260905190000_seed_initial_tenant.sql`
 * takes the name and slug from `app.initial_tenant_*` with a neutral fallback
 * (#795 Phase 3), so hardcoding one here would pin the suite to a single
 * deployment's choice -- which is the literal that ticket removed. The initial
 * tenant is always the oldest: the demo tenant and anything a spec provisions
 * are created after it.
 */
export async function initialTenantId(): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tenants")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (error) {
    throw new Error(`Could not find the initial tenant: ${error.message}`);
  }
  return data.id;
}
