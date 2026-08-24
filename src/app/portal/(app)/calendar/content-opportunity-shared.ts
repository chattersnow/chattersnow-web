import { addDays } from "@/lib/time";
import type { TemplateField } from "./content-brief-template-shared";

export const CONTENT_STATUSES = [
  { value: "not_planned", label: "Not planned" },
  { value: "idea", label: "Idea" },
  { value: "draft", label: "Draft" },
  { value: "in_review", label: "In review" },
  { value: "changes_requested", label: "Changes requested" },
  { value: "approved", label: "Approved" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
  { value: "skipped", label: "Skipped" },
] as const;

export type ContentOpportunityRow = {
  id: string;
  calendar_item_id: string;
  content_status: string;
  skip_reason: string | null;
  chatter_connection: string | null;
  recommended_formats: string | null;
  recommended_action: string | null;
  outstanding_work: string | null;
  owner_id: string | null;
  reviewer_id: string | null;
  lead_time_days: number;
  publish_due_at: string | null;
  review_due_at: string | null;
  draft_due_at: string | null;
  status_changed_by: string | null;
  status_changed_at: string | null;
  template_id: string | null;
  template_version_id: string | null;
  template_field_values: Record<string, string>;
  template_version: {
    id: string;
    version: number;
    fields: TemplateField[];
  } | null;
};

/**
 * 21-day lead time -> draft T-14, review T-7 (the issue's worked example):
 * the draft period is the first two-thirds of the lead time, the review
 * period is the last third.
 */
export function leadTimeSchedule(
  publishDueAt: Date,
  leadTimeDays: number,
): { draftDueAt: Date; reviewDueAt: Date } {
  return {
    draftDueAt: addDays(publishDueAt, -Math.round((leadTimeDays * 2) / 3)),
    reviewDueAt: addDays(publishDueAt, -Math.round(leadTimeDays / 3)),
  };
}

const DRAFT_STAGE_STATUSES = ["not_planned", "idea", "draft"];
const REVIEW_STAGE_STATUSES = ["in_review", "changes_requested"];
const PUBLISH_STAGE_STATUSES = ["approved", "scheduled"];

export type OverdueStage = "draft" | "review" | "publish";

type StageDates = Pick<
  ContentOpportunityRow,
  "content_status" | "draft_due_at" | "review_due_at" | "publish_due_at"
>;

/**
 * Which lead-time deadline is currently live for this opportunity's stage,
 * and whether it's already passed. Nothing is overdue once the opportunity
 * reaches a terminal status (published/skipped).
 */
export function overdueStage(
  opp: StageDates,
  now: Date = new Date(),
): OverdueStage | null {
  if (DRAFT_STAGE_STATUSES.includes(opp.content_status)) {
    return opp.draft_due_at && new Date(opp.draft_due_at) < now
      ? "draft"
      : null;
  }
  if (REVIEW_STAGE_STATUSES.includes(opp.content_status)) {
    return opp.review_due_at && new Date(opp.review_due_at) < now
      ? "review"
      : null;
  }
  if (PUBLISH_STAGE_STATUSES.includes(opp.content_status)) {
    return opp.publish_due_at && new Date(opp.publish_due_at) < now
      ? "publish"
      : null;
  }
  return null;
}

/** The due date relevant to the opportunity's current stage, for queue sorting. */
export function effectiveDueDate(opp: StageDates): string | null {
  if (DRAFT_STAGE_STATUSES.includes(opp.content_status))
    return opp.draft_due_at;
  if (REVIEW_STAGE_STATUSES.includes(opp.content_status))
    return opp.review_due_at;
  if (PUBLISH_STAGE_STATUSES.includes(opp.content_status))
    return opp.publish_due_at;
  return null;
}

export function isMyContentWork(
  opp: Pick<
    ContentOpportunityRow,
    "content_status" | "owner_id" | "reviewer_id"
  >,
  userId: string,
): boolean {
  if (opp.content_status === "published" || opp.content_status === "skipped")
    return false;
  return opp.owner_id === userId || opp.reviewer_id === userId;
}

export function isChangesRequestedForMe(
  opp: Pick<ContentOpportunityRow, "content_status" | "owner_id">,
  userId: string,
): boolean {
  return opp.content_status === "changes_requested" && opp.owner_id === userId;
}
