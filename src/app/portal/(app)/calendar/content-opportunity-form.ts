import { CONTENT_STATUSES } from "./content-opportunity-shared";
import type { ParseResult } from "@/lib/forms";

const CONTENT_STATUS_VALUES = CONTENT_STATUSES.map((option) => option.value);

export type ContentOpportunityFormData = {
  contentStatus: (typeof CONTENT_STATUS_VALUES)[number];
  skipReason: string | null;
  chatterConnection: string | null;
  recommendedFormats: string | null;
  recommendedAction: string | null;
  outstandingWork: string | null;
  internalNotes: string | null;
  ownerId: string | null;
  reviewerId: string | null;
  leadTimeDays: number;
  publishDueAt: string | null;
  reviewDueAt: string | null;
  draftDueAt: string | null;
  templateId: string | null;
  templateVersionId: string | null;
  templateFieldValues: Record<string, string>;
};

export function parseContentOpportunityForm(
  formData: FormData,
): ParseResult<ContentOpportunityFormData> {
  const contentStatus = String(formData.get("contentStatus") ?? "");
  const skipReason = String(formData.get("skipReason") ?? "").trim();
  const chatterConnection = String(
    formData.get("chatterConnection") ?? "",
  ).trim();
  const recommendedFormats = String(
    formData.get("recommendedFormats") ?? "",
  ).trim();
  const recommendedAction = String(
    formData.get("recommendedAction") ?? "",
  ).trim();
  const outstandingWork = String(formData.get("outstandingWork") ?? "").trim();
  const internalNotes = String(formData.get("internalNotes") ?? "").trim();
  const ownerId = String(formData.get("ownerId") ?? "").trim();
  const reviewerId = String(formData.get("reviewerId") ?? "").trim();
  const leadTimeDaysRaw = String(formData.get("leadTimeDays") ?? "");
  const publishDueAt = String(formData.get("publishDueAt") ?? "");
  const reviewDueAt = String(formData.get("reviewDueAt") ?? "");
  const draftDueAt = String(formData.get("draftDueAt") ?? "");
  const templateId = String(formData.get("templateId") ?? "").trim();
  const templateVersionId = String(
    formData.get("templateVersionId") ?? "",
  ).trim();
  const templateFieldValuesRaw = String(
    formData.get("templateFieldValues") ?? "",
  );

  if (
    !CONTENT_STATUS_VALUES.includes(
      contentStatus as (typeof CONTENT_STATUS_VALUES)[number],
    )
  ) {
    return { error: "Select a valid content status." };
  }
  if (contentStatus === "skipped" && !skipReason) {
    return { error: "A reason is required when content is skipped." };
  }
  if (
    !["not_planned", "idea", "skipped"].includes(contentStatus) &&
    !chatterConnection
  ) {
    return {
      error:
        "A stated Chatter connection is required once work begins on this content.",
    };
  }

  const leadTimeDays = Number(leadTimeDaysRaw);
  if (!Number.isInteger(leadTimeDays) || leadTimeDays <= 0) {
    return {
      error: "Lead time must be a whole number of days greater than zero.",
    };
  }

  const publishDueAtIso = publishDueAt
    ? new Date(publishDueAt).toISOString()
    : null;
  const reviewDueAtIso = reviewDueAt
    ? new Date(reviewDueAt).toISOString()
    : null;
  const draftDueAtIso = draftDueAt ? new Date(draftDueAt).toISOString() : null;

  if (draftDueAtIso && reviewDueAtIso && draftDueAtIso > reviewDueAtIso) {
    return {
      error: "Draft due date must be on or before the review due date.",
    };
  }
  if (reviewDueAtIso && publishDueAtIso && reviewDueAtIso > publishDueAtIso) {
    return {
      error: "Review due date must be on or before the publish due date.",
    };
  }

  if (Boolean(templateId) !== Boolean(templateVersionId)) {
    return {
      error: "Select a content brief template before saving field values.",
    };
  }

  let templateFieldValues: Record<string, string> = {};
  if (templateFieldValuesRaw) {
    try {
      const parsed = JSON.parse(templateFieldValuesRaw) as Record<
        string,
        unknown
      >;
      if (parsed && typeof parsed === "object") {
        for (const [key, value] of Object.entries(parsed)) {
          templateFieldValues[key] = String(value ?? "").trim();
        }
      }
    } catch {
      templateFieldValues = {};
    }
  }

  return {
    data: {
      contentStatus: contentStatus as (typeof CONTENT_STATUS_VALUES)[number],
      skipReason: contentStatus === "skipped" ? skipReason : null,
      chatterConnection: chatterConnection || null,
      recommendedFormats: recommendedFormats || null,
      recommendedAction: recommendedAction || null,
      outstandingWork: outstandingWork || null,
      internalNotes: internalNotes || null,
      ownerId: ownerId || null,
      reviewerId: reviewerId || null,
      leadTimeDays,
      publishDueAt: publishDueAtIso,
      reviewDueAt: reviewDueAtIso,
      draftDueAt: draftDueAtIso,
      templateId: templateId || null,
      templateVersionId: templateVersionId || null,
      templateFieldValues,
    },
  };
}
