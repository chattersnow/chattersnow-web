export const ASSET_CATEGORIES = [
  "domain",
  "hosting",
  "database",
  "social",
  "financial",
  "communication",
  "productivity",
  "other",
] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export const ASSET_STATUSES = ["active", "inactive", "decommissioned"] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const MFA_STATUSES = ["enabled", "disabled", "unknown"] as const;
export type MfaStatus = (typeof MFA_STATUSES)[number];

export const CREDENTIAL_MANAGEMENT_LOCATIONS = [
  "password_manager",
  "individual_account",
  "unknown",
] as const;
export type CredentialManagementLocation =
  (typeof CREDENTIAL_MANAGEMENT_LOCATIONS)[number];

export const ACCESS_LEVELS = [
  "owner",
  "admin",
  "manager",
  "editor",
  "contributor",
  "viewer",
  "billing",
  "support",
  "custom",
] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export const GRANT_STATUSES = ["active", "revoked", "expired"] as const;
export type GrantStatus = (typeof GRANT_STATUSES)[number];

export type ServiceRow = {
  id: string;
  name: string;
  website: string | null;
  notes: string | null;
};

export type PersonRef = { id: string; name: string | null } | null;

export type AssetListRow = {
  id: string;
  name: string;
  category: AssetCategory;
  status: AssetStatus;
  sensitivity: import("./review-cadence").Sensitivity;
  mfa_status: MfaStatus;
  next_review: string | null;
  service: { id: string; name: string } | null;
};

export type AssetDetail = {
  id: string;
  name: string;
  service_id: string;
  category: AssetCategory;
  description: string | null;
  url: string | null;
  is_org_owned: boolean;
  owner_person_id: string | null;
  primary_admin_person_id: string | null;
  backup_admin_person_id: string | null;
  status: AssetStatus;
  sensitivity: import("./review-cadence").Sensitivity;
  mfa_required: boolean;
  mfa_status: MfaStatus;
  recovery_documented: boolean;
  recovery_owner_person_id: string | null;
  credential_management_location: CredentialManagementLocation;
  last_reviewed: string | null;
  next_review: string | null;
  notes: string | null;
  service: { id: string; name: string } | null;
  owner: PersonRef;
  primary_admin: PersonRef;
  backup_admin: PersonRef;
  recovery_owner: PersonRef;
};

export type AccessGrantRow = {
  id: string;
  asset_id: string;
  person_id: string;
  access_level: AccessLevel;
  account_identifier: string | null;
  purpose: string | null;
  granted_at: string;
  status: GrantStatus;
  expires_at: string | null;
  last_verified: string | null;
  revoked_at: string | null;
  notes: string | null;
  person: PersonRef;
};
