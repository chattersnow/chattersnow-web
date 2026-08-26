import { overdueStage } from "../content-opportunity-shared";

export type AnnualReviewItemRow = {
  id: string;
  priority_tier: number;
  decision: string | null;
  visibility: string;
  calendar_status: string;
};

export type AnnualReviewOpportunityRow = {
  id: string;
  calendar_item_id: string;
  content_status: string;
  chatter_connection: string | null;
  template_id: string | null;
  draft_due_at: string | null;
  review_due_at: string | null;
  publish_due_at: string | null;
  created_at: string;
  status_changed_at: string | null;
};

export type AnnualReviewPermissionRow = {
  id: string;
  content_opportunity_id: string;
};

export type AnnualReview = {
  tier1Decided: number;
  tier1Total: number;
  plannedCompletedOnTime: number;
  plannedWithPublishTarget: number;
  overdueCount: number;
  medianBriefToReviewDays: number | null;
  publicWithConnectionCount: number;
  permissionsRecordedCount: number;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function computeAnnualReview(
  items: AnnualReviewItemRow[],
  opportunities: AnnualReviewOpportunityRow[],
  permissions: AnnualReviewPermissionRow[],
  now: Date = new Date(),
): AnnualReview {
  const itemById = new Map(items.map((item) => [item.id, item]));

  const tier1Items = items.filter((item) => item.priority_tier === 1);
  const tier1Decided = tier1Items.filter(
    (item) => item.decision !== null,
  ).length;

  const plannedOpportunities = opportunities.filter((opp) => {
    const item = itemById.get(opp.calendar_item_id);
    return item?.decision === "plan" && opp.publish_due_at !== null;
  });
  const plannedCompletedOnTime = plannedOpportunities.filter(
    (opp) =>
      opp.content_status === "published" &&
      opp.status_changed_at !== null &&
      new Date(opp.status_changed_at) <= new Date(opp.publish_due_at!),
  ).length;

  const overdueCount = opportunities.filter(
    (opp) => overdueStage(opp, now) !== null,
  ).length;

  const briefToReviewDays = opportunities
    .filter(
      (opp) => opp.template_id !== null && opp.content_status === "in_review",
    )
    .map((opp) => {
      const created = new Date(opp.created_at).getTime();
      const reviewedAt = new Date(
        opp.status_changed_at ?? opp.created_at,
      ).getTime();
      return (reviewedAt - created) / (1000 * 60 * 60 * 24);
    });

  const publicWithConnectionCount = opportunities.filter((opp) => {
    const item = itemById.get(opp.calendar_item_id);
    if (!item) return false;
    const isLivePublic =
      item.visibility === "public" &&
      (item.calendar_status === "active" ||
        item.calendar_status === "complete");
    return (
      isLivePublic &&
      opp.chatter_connection !== null &&
      opp.chatter_connection.trim() !== ""
    );
  }).length;

  return {
    tier1Decided,
    tier1Total: tier1Items.length,
    plannedCompletedOnTime,
    plannedWithPublishTarget: plannedOpportunities.length,
    overdueCount,
    medianBriefToReviewDays: median(briefToReviewDays),
    publicWithConnectionCount,
    permissionsRecordedCount: permissions.length,
  };
}
