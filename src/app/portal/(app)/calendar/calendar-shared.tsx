import type { ContentOpportunityRow } from "./content-opportunity-shared";

export const ITEM_TYPES = [
  { value: "chatter_event", label: "Chatter event" },
  { value: "partner_event", label: "Partner / co-hosted event" },
  { value: "community_observance", label: "Community observance" },
  {
    value: "heritage_social_justice_moment",
    label: "Heritage / social justice moment",
  },
  {
    value: "winter_outdoor_sports_moment",
    label: "Winter / outdoor sports moment",
  },
  { value: "content_campaign", label: "Content campaign" },
  { value: "fundraiser", label: "Fundraiser / donation drive" },
  { value: "partner_opportunity", label: "Partner opportunity" },
  { value: "content_opportunity", label: "Content opportunity" },
] as const;

export const CATEGORIES = [
  { value: "lgbtq_community", label: "LGBTQ+ community" },
  { value: "winter_outdoor_sports", label: "Winter & outdoor sports" },
  { value: "community_social_justice", label: "Community & social justice" },
  { value: "chatter_events", label: "Chatter events" },
  { value: "campaigns_fundraising", label: "Campaigns & fundraising" },
  { value: "partner_opportunities", label: "Partner opportunities" },
] as const;

export const PRIORITY_TIERS = [
  { value: "1", label: "Tier 1" },
  { value: "2", label: "Tier 2" },
  { value: "3", label: "Tier 3" },
] as const;

export const CALENDAR_STATUSES = [
  { value: "idea", label: "Idea" },
  { value: "active", label: "Active" },
  { value: "complete", label: "Complete" },
  { value: "archived", label: "Archived" },
] as const;

export const VISIBILITIES = [
  { value: "public", label: "Public" },
  { value: "internal", label: "Internal" },
  { value: "unlisted_draft", label: "Unlisted draft" },
] as const;

export const DECISIONS = [
  { value: "plan", label: "Plan" },
  { value: "skip", label: "Skip" },
  { value: "defer", label: "Defer" },
] as const;

export const RANGES = [
  { value: "all", label: "All upcoming" },
  { value: "30", label: "Next 30 days" },
  { value: "60", label: "Next 60 days" },
  { value: "90", label: "Next 90 days" },
] as const;

type Option = { value: string; label: string };

export function labelFor(
  options: readonly Option[],
  value: string | null | undefined,
): string {
  return (
    options.find((option) => option.value === value)?.label ?? value ?? "—"
  );
}

export type CalendarItemRow = {
  id: string;
  title: string;
  item_type: string;
  starts_at: string;
  ends_at: string | null;
  time_zone: string;
  recurrence_rule: string | null;
  summary: string | null;
  priority_tier: number;
  priority_rationale: string | null;
  calendar_status: string;
  visibility: string;
  owner_id: string | null;
  decision: string | null;
  decision_note: string | null;
  source: string | null;
  region: string | null;
  exceptions: unknown[];
  is_sensitive_topic: boolean;
  tone_guidance: string | null;
  sensitive_review_by: string | null;
  sensitive_review_at: string | null;
  series_key: string | null;
  recurrence_start_month: number | null;
  recurrence_start_day: number | null;
  recurrence_end_month: number | null;
  recurrence_end_day: number | null;
  recurrence_end_is_month_end: boolean;
  categories: string[];
  program_ids: string[];
  content_opportunity: ContentOpportunityRow | null;
};

export type CalendarOwner = { user_id: string; email: string | null };
export type CalendarProgram = { id: string; name: string; status: string };

export function needsDecision(
  item: Pick<CalendarItemRow, "priority_tier" | "decision" | "calendar_status">,
): boolean {
  return (
    item.priority_tier === 1 &&
    !item.decision &&
    item.calendar_status !== "archived"
  );
}

export function isPastUndecided(
  item: Pick<CalendarItemRow, "starts_at" | "decision" | "calendar_status">,
  now: Date = new Date(),
): boolean {
  return (
    new Date(item.starts_at) < now &&
    !item.decision &&
    item.calendar_status !== "complete" &&
    item.calendar_status !== "archived"
  );
}

export function needsSensitiveReview(
  item: Pick<
    CalendarItemRow,
    "is_sensitive_topic" | "sensitive_review_by" | "calendar_status"
  >,
): boolean {
  return (
    item.is_sensitive_topic &&
    !item.sensitive_review_by &&
    item.calendar_status !== "archived"
  );
}

export function ownerEmail(
  owners: CalendarOwner[],
  ownerId: string | null,
): string {
  if (!ownerId) return "—";
  return owners.find((owner) => owner.user_id === ownerId)?.email ?? "—";
}
