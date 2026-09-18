import { CONTENT_STATUSES } from "./content-opportunity-shared";
import type { ParseResult } from "@/lib/forms";

const CONTENT_STATUS_VALUES = CONTENT_STATUSES.map((option) => option.value);

export type ContentPieceFormData = {
  title: string;
  content: string | null;
  contentStatus: (typeof CONTENT_STATUS_VALUES)[number];
  skipReason: string | null;
  internalNotes: string | null;
  ownerId: string | null;
  reviewerId: string | null;
  leadTimeDays: number;
  publishDueAt: string | null;
  reviewDueAt: string | null;
  draftDueAt: string | null;
};

export function parseContentPieceForm(
  formData: FormData,
): ParseResult<ContentPieceFormData> {
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const contentStatus = String(formData.get("contentStatus") ?? "");
  const skipReason = String(formData.get("skipReason") ?? "").trim();
  const internalNotes = String(formData.get("internalNotes") ?? "").trim();
  const ownerId = String(formData.get("ownerId") ?? "").trim();
  const reviewerId = String(formData.get("reviewerId") ?? "").trim();
  const leadTimeDaysRaw = String(formData.get("leadTimeDays") ?? "");
  const publishDueAt = String(formData.get("publishDueAt") ?? "");
  const reviewDueAt = String(formData.get("reviewDueAt") ?? "");
  const draftDueAt = String(formData.get("draftDueAt") ?? "");

  if (!title) {
    return { error: "Give this piece a title." };
  }
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
      title,
      content: content || null,
      contentStatus: contentStatus as (typeof CONTENT_STATUS_VALUES)[number],
      skipReason: contentStatus === "skipped" ? skipReason : null,
      internalNotes: internalNotes || null,
      ownerId: ownerId || null,
      reviewerId: reviewerId || null,
      leadTimeDays,
      publishDueAt: publishDueAtIso,
      reviewDueAt: reviewDueAtIso,
      draftDueAt: draftDueAtIso,
    },
  };
}
