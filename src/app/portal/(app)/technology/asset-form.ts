import type { ParseResult } from "@/lib/forms";
import {
  SENSITIVITY_LEVELS,
  type Sensitivity,
} from "@/lib/portal/access-management/review-cadence";
import {
  ASSET_CATEGORIES,
  ASSET_STATUSES,
  CREDENTIAL_MANAGEMENT_LOCATIONS,
  MFA_STATUSES,
  type AssetCategory,
  type AssetStatus,
  type CredentialManagementLocation,
  type MfaStatus,
} from "@/lib/portal/access-management/types";

export type AssetFormData = {
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
  sensitivity: Sensitivity;
  mfa_required: boolean;
  mfa_status: MfaStatus;
  recovery_documented: boolean;
  recovery_owner_person_id: string | null;
  credential_management_location: CredentialManagementLocation;
  notes: string | null;
};

function optionalString(formData: FormData, key: string): string | null {
  return String(formData.get(key) ?? "").trim() || null;
}

function isOneOf<T extends string>(
  value: string,
  options: readonly T[],
): value is T {
  return (options as readonly string[]).includes(value);
}

export function parseAssetForm(formData: FormData): ParseResult<AssetFormData> {
  const name = String(formData.get("name") ?? "").trim();
  const serviceId = String(formData.get("service_id") ?? "").trim();
  const category = String(formData.get("category") ?? "");
  const status = String(formData.get("status") ?? "active");
  const sensitivity = String(formData.get("sensitivity") ?? "medium");
  const mfaStatus = String(formData.get("mfa_status") ?? "unknown");
  const credentialManagementLocation = String(
    formData.get("credential_management_location") ?? "unknown",
  );
  const url = optionalString(formData, "url");

  if (!name) return { error: "Asset name is required." };
  if (!serviceId) return { error: "Select a service." };
  if (!isOneOf(category, ASSET_CATEGORIES)) {
    return { error: "Select a valid category." };
  }
  if (!isOneOf(status, ASSET_STATUSES)) {
    return { error: "Select a valid status." };
  }
  if (!isOneOf(sensitivity, SENSITIVITY_LEVELS)) {
    return { error: "Select a valid sensitivity." };
  }
  if (!isOneOf(mfaStatus, MFA_STATUSES)) {
    return { error: "Select a valid MFA status." };
  }
  if (!isOneOf(credentialManagementLocation, CREDENTIAL_MANAGEMENT_LOCATIONS)) {
    return { error: "Select a valid credential management location." };
  }
  if (url && !/^https?:\/\//i.test(url)) {
    return { error: "URL must start with http:// or https://." };
  }

  return {
    data: {
      name,
      service_id: serviceId,
      category,
      description: optionalString(formData, "description"),
      url,
      is_org_owned: formData.get("is_org_owned") === "true",
      owner_person_id: optionalString(formData, "owner_person_id"),
      primary_admin_person_id: optionalString(
        formData,
        "primary_admin_person_id",
      ),
      backup_admin_person_id: optionalString(
        formData,
        "backup_admin_person_id",
      ),
      status,
      sensitivity,
      mfa_required: formData.get("mfa_required") === "true",
      mfa_status: mfaStatus,
      recovery_documented: formData.get("recovery_documented") === "true",
      recovery_owner_person_id: optionalString(
        formData,
        "recovery_owner_person_id",
      ),
      credential_management_location: credentialManagementLocation,
      notes: optionalString(formData, "notes"),
    },
  };
}
