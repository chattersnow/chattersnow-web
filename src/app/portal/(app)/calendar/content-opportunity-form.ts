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
  ownerId: string | null;
  reviewerId: string | null;
  leadTimeDays: number;
  publishDueAt: string | null;
  reviewDueAt: string | null;
  draftDueAt: string | null;
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
  const ownerId = String(formData.get("ownerId") ?? "").trim();
  const reviewerId = String(formData.get("reviewerId") ?? "").trim();
  const leadTimeDaysRaw = String(formData.get("leadTimeDays") ?? "");
  const publishDueAt = String(formData.get("publishDueAt") ?? "");
  const reviewDueAt = String(formData.get("reviewDueAt") ?? "");
  const draftDueAt = String(formData.get("draftDueAt") ?? "");

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

  return {
    data: {
      contentStatus: contentStatus as (typeof CONTENT_STATUS_VALUES)[number],
      skipReason: contentStatus === "skipped" ? skipReason : null,
      chatterConnection: chatterConnection || null,
      recommendedFormats: recommendedFormats || null,
      recommendedAction: recommendedAction || null,
      outstandingWork: outstandingWork || null,
      ownerId: ownerId || null,
      reviewerId: reviewerId || null,
      leadTimeDays,
      publishDueAt: publishDueAtIso,
      reviewDueAt: reviewDueAtIso,
      draftDueAt: draftDueAtIso,
    },
  };
}
