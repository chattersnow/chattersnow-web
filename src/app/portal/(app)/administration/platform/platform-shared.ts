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
