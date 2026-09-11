import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * One tenant's module entitlements (#900), read the way a job with no session
 * has to read them (#903).
 *
 * There are three of these now and they answer for three different audiences,
 * which is worth keeping straight:
 *
 *   - `getTenantModules` (src/lib/page-visibility.ts) asks `my_modules()` for
 *     the tenant the *signed-in caller has selected* -- the administration
 *     panels that explain why a control is unavailable.
 *   - `getPublicTenantModules` (same file) asks `public_tenant_modules` for
 *     the tenant the *request host* resolves to -- the public site, which has
 *     no session at all.
 *   - this one names the tenant, because the callers are background jobs
 *     running as `service_role` under a cron route: no host, no session, and
 *     several tenants per run.
 *
 * Fails open, like both of the others and like `module_enabled_for_tenant()`
 * underneath them. A tenant whose entitlements cannot be read gets the report
 * it got last week rather than silence; a gate that shuts on a failed query
 * turns a transient database error into a section of the product going dark.
 */
export type ModuleMap = Record<string, boolean>;

export async function modulesForTenant(
  admin: SupabaseClient,
  tenantId: string,
): Promise<ModuleMap> {
  const { data, error } = await admin.rpc("modules_for_tenant", {
    p_tenant_id: tenantId,
  });

  if (error) {
    console.error(
      `[modules] could not read the modules of tenant ${tenantId}; treating every module as enabled`,
      error,
    );
    return {};
  }

  const modules: ModuleMap = {};
  for (const row of (data ?? []) as {
    module_key: string;
    enabled: boolean;
  }[]) {
    modules[row.module_key] = row.enabled !== false;
  }
  return modules;
}

/**
 * Whether a module is on, for a map that may not have heard of it.
 *
 * `!== false` rather than a truth test, so an unknown key -- a module added
 * after a map was read, or a map that failed to load -- is on. Same direction
 * as the `coalesce(..., true)` at the bottom of `module_enabled_for_tenant()`.
 */
export function moduleEnabled(modules: ModuleMap, key: string): boolean {
  return modules[key] !== false;
}
