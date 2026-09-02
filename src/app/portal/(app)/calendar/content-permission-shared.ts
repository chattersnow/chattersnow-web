import type { ParseResult } from "@/lib/forms";

export type ContentPermissionRow = {
  id: string;
  content_opportunity_id: string;
  permitted_use: string;
  usage_limits: string | null;
  consent_on_file_at: string;
  recorded_by: string | null;
  created_at: string;
};

export type ContentPermissionFormData = {
  permittedUse: string;
  usageLimits: string | null;
  consentOnFileAt: string;
};

export function parseContentPermissionForm(
  formData: FormData,
): ParseResult<ContentPermissionFormData> {
  const permittedUse = String(formData.get("permittedUse") ?? "").trim();
  const usageLimits = String(formData.get("usageLimits") ?? "").trim();
  const consentOnFileAt = String(formData.get("consentOnFileAt") ?? "").trim();

  if (!permittedUse) {
    return { error: "Describe the permitted use before saving consent." };
  }
  if (!consentOnFileAt) {
    return { error: "The date consent was recorded is required." };
  }

  return {
    data: {
      permittedUse,
      usageLimits: usageLimits || null,
      consentOnFileAt,
    },
  };
}

/**
 * Content statuses gated on recorded consent (for spotlight-type templates)
 * and on sensitive-topic reviewer sign-off. Shared by the client (to show a
 * warning before submit) and the server action (the actual hard gate), so
 * the rule lives in exactly one place.
 */
const CONSENT_GATED_STATUSES = ["approved", "scheduled", "published"];

export function needsConsentGate(contentStatus: string): boolean {
  return CONSENT_GATED_STATUSES.includes(contentStatus);
}

export function needsSensitiveReviewGate(
  contentStatus: string,
  isSensitiveTopic: boolean,
  sensitiveReviewBy: string | null,
): boolean {
  return (
    isSensitiveTopic &&
    !sensitiveReviewBy &&
    CONSENT_GATED_STATUSES.includes(contentStatus)
  );
}
