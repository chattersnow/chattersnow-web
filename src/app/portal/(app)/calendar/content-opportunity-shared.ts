import { addDays } from "@/lib/time";

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
