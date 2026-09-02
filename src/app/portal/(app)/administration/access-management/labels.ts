export function humanize(value: string): string {
  const spaced = value.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export const CATEGORY_OPTIONS = [
  "domain",
  "hosting",
  "database",
  "social",
  "financial",
  "communication",
  "productivity",
  "other",
].map((value) => ({ value, label: humanize(value) }));

export const ASSET_STATUS_OPTIONS = [
  "active",
  "inactive",
  "decommissioned",
].map((value) => ({ value, label: humanize(value) }));

export const SENSITIVITY_OPTIONS = ["low", "medium", "high", "critical"].map(
  (value) => ({ value, label: humanize(value) }),
);

export const MFA_STATUS_OPTIONS = ["enabled", "disabled", "unknown"].map(
  (value) => ({ value, label: humanize(value) }),
);

export const CREDENTIAL_MANAGEMENT_LOCATION_OPTIONS = [
  "password_manager",
  "individual_account",
  "unknown",
].map((value) => ({ value, label: humanize(value) }));

export const ACCESS_LEVEL_OPTIONS = [
  "owner",
  "admin",
  "manager",
  "editor",
  "contributor",
  "viewer",
  "billing",
  "support",
  "custom",
].map((value) => ({ value, label: humanize(value) }));

export const GRANT_STATUS_OPTIONS = ["active", "revoked", "expired"].map(
  (value) => ({ value, label: humanize(value) }),
);
