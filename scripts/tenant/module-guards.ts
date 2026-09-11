// The safety checks behind `tenant-cli.ts modules` (#901).
//
// Split out and kept free of any I/O for the same reason
// scripts/tenant/plan-guards.ts is, though the reasoning differs in one
// important way. `tenant:plan` has no counterpart in the database at all, so
// its guards are the only check there is. These ones do have a counterpart:
// #900 put a trigger on `tenant_modules` that refuses a disabled core module
// whoever writes it, service_role included, and `platform_set_tenant_module()`
// refuses all three of the cases below.
//
// The CLI writes as service_role and so goes around the RPC entirely -- that is
// the point of it, since it is the fallback for when the portal is what is
// broken. So these exist to give the operator a sentence instead of a trigger's
// error, and to cover the two refusals the database has no opinion about: an
// unknown module key (a typo writes nothing and says nothing without this) and
// disabling a module on the internal tenant (legal in the schema, and the end
// of platform administration in practice). The trigger is the backstop
// underneath, not the thing being duplicated.

/** Just enough of a `tenants` row to decide whether a module change is safe. */
export type TenantRow = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
};

/** Just enough of a `modules` row for the same. */
export type ModuleRow = {
  key: string;
  label: string;
  is_core: boolean;
};

export class TenantModuleError extends Error {}

export type ModuleChange = {
  tenant: TenantRow | null;
  /** The whole catalog, so an unknown key can be answered with the real list. */
  catalog: ModuleRow[];
  requestedKey: string;
  enabled: boolean;
};

/**
 * Throws unless this module change is one the operator may make. Returns the
 * catalog row, so the caller can name the module in its output without looking
 * it up again.
 */
export function assertModuleChange({
  tenant,
  catalog,
  requestedKey,
  enabled,
}: ModuleChange): ModuleRow {
  if (!tenant) {
    throw new TenantModuleError("No tenant with that slug exists.");
  }

  // Named `target` rather than `module`, which the Next lint config refuses
  // anywhere in the repo (@next/next/no-assign-module-variable).
  const target = catalog.find((entry) => entry.key === requestedKey);
  if (!target) {
    const known = catalog.map((entry) => entry.key).join(", ");
    throw new TenantModuleError(
      `"${requestedKey}" is not a module. Use one of: ${known || "(the catalog is empty)"}.`,
    );
  }

  if (target.is_core && !enabled) {
    throw new TenantModuleError(
      `"${target.key}" is a core module: the portal does not work without it, ` +
        `so it cannot be turned off for anyone. The database refuses this too.`,
    );
  }

  // Platform administration resolves only inside a tenant on the `internal`
  // plan, and it is a membership rather than a bypass -- the same reasoning
  // that stops `tenant:plan` moving the last internal tenant off that plan.
  // Turning a section off there is the operator removing their own controls,
  // and there is no super-admin to put them back.
  if (tenant.plan === "internal" && !enabled) {
    throw new TenantModuleError(
      `Refusing to turn "${target.key}" off for "${tenant.slug}": it is the ` +
        `platform tenant, and its own portal is where every other ` +
        `organization is administered from.`,
    );
  }

  return target;
}
