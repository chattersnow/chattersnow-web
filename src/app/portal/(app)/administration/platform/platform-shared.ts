/** A tenant as the platform page sees it: metadata, never customer data. */
export type PlatformTenant = {
  id: string;
  slug: string;
  name: string;
  status: "active" | "suspended" | "archived";
  plan: "internal" | "demo" | "white_label";
  custom_domain: string | null;
  member_count: number;
  support_grant_count: number;
  created_at: string;
};

export const TENANT_STATUSES = ["active", "suspended", "archived"] as const;
export const TENANT_PLANS = ["white_label", "demo", "internal"] as const;

export const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  suspended: "Suspended",
  archived: "Archived",
};

export const PLAN_LABEL: Record<string, string> = {
  internal: "Platform",
  demo: "Demo",
  white_label: "White label",
};

/**
 * One module's entitlement for one tenant, as `platform_list_tenant_modules()`
 * reports it (#901).
 *
 * `source` is the load-bearing field: `tenant` means somebody set this flag for
 * this organization, `plan` means it is still whatever the plan gives, and
 * `default` means the plan has no opinion either and the catalog decides. An
 * operator looking at this page is usually trying to tell the first from the
 * other two.
 */
export type TenantModule = {
  module_key: string;
  label: string;
  description: string | null;
  sort_order: number;
  is_core: boolean;
  enabled: boolean;
  source: "tenant" | "plan" | "default";
  updated_at: string | null;
  updated_by_email: string | null;
};

/** Where a module's current value comes from, in words, for the dialog. */
export function moduleSourceNote(
  module: TenantModule,
  plan: string,
): string | null {
  if (module.source === "tenant") return null;
  const state = module.enabled ? "On" : "Off";
  return module.source === "plan"
    ? `${state} by default on the ${PLAN_LABEL[plan] ?? plan} plan — not set for this organization.`
    : `${state} by catalog default — neither the plan nor this organization sets it.`;
}
