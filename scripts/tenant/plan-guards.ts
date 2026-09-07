// The safety checks behind `tenant-cli.ts plan` (#795 Phase 1).
//
// Split out and kept free of any I/O for the same reason scripts/demo/guards.ts
// is: the one rule here whose failure is unrecoverable -- "never leave the
// deployment without an internal tenant" -- cannot be exercised by running the
// real thing against a real project, and a rule nobody checks is not a rule.
//
// Unlike every other write in tenant-cli.ts, this one has no counterpart in the
// database. `tenants.plan` is written only by the insert inside
// provision_tenant(); there is no RPC that changes it, and the portal's
// Platform page deliberately offers domain, status and export but not the
// plan. So there is no second opinion behind these checks -- they are the only
// thing between a mistyped slug and a deployment whose platform tenant has
// stopped being one.

/** Just enough of a `tenants` row to decide whether a plan change is safe. */
export type TenantRow = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
};

export class TenantPlanError extends Error {}

/**
 * The values `tenants.plan` accepts, per the check constraint in
 * 20260905180000_create_tenants_and_memberships.sql. Kept here rather than
 * left to Postgres so a typo fails before it reaches the database, where the
 * error names a constraint rather than the three words that would have worked.
 */
export const TENANT_PLANS = ["internal", "demo", "white_label"] as const;

export type TenantPlan = (typeof TENANT_PLANS)[number];

export type PlanChange = {
  tenant: TenantRow | null;
  requestedPlan: string;
  /**
   * Active tenants on the `internal` plan other than this one. Counted by the
   * caller because the guard does no I/O; zero is what makes moving this
   * tenant off `internal` the end of platform administration.
   */
  otherActiveInternalTenants: number;
};

/**
 * Throws unless this plan change is one the operator may make. Returns the
 * requested plan, narrowed, so it can be used inline.
 *
 * The last check is the one that matters. `is_platform_operator()`
 * (20260906180000_platform_tenant_admin.sql) requires the caller to be inside a
 * tenant whose plan is `internal`; platform access is a membership rather than
 * a bypass, so with no internal tenant left there is no door back in and no
 * super-admin to open one. `platform_set_tenant_status()` refuses to archive
 * the internal tenant for exactly this reason -- this is the same refusal for
 * the column that RPC cannot touch.
 */
export function assertPlanChange({
  tenant,
  requestedPlan,
  otherActiveInternalTenants,
}: PlanChange): TenantPlan {
  if (!tenant) {
    throw new TenantPlanError("No tenant with that slug exists.");
  }
  if (!(TENANT_PLANS as readonly string[]).includes(requestedPlan)) {
    throw new TenantPlanError(
      `"${requestedPlan}" is not a plan. Use one of: ${TENANT_PLANS.join(", ")}.`,
    );
  }
  if (tenant.plan === requestedPlan) {
    throw new TenantPlanError(
      `"${tenant.slug}" is already on the ${requestedPlan} plan; nothing to do.`,
    );
  }
  if (
    tenant.plan === "internal" &&
    tenant.status === "active" &&
    otherActiveInternalTenants === 0
  ) {
    throw new TenantPlanError(
      `Refusing to move "${tenant.slug}" off the internal plan: it is the only ` +
        `active internal tenant, and platform administration resolves only ` +
        `inside one. Provision the new internal tenant first.`,
    );
  }
  return requestedPlan as TenantPlan;
}
