export type PublicCalendarItem = {
  id: string;
  title: string;
  item_type: string;
  starts_at: string;
  ends_at: string | null;
  time_zone: string;
  summary: string | null;
  categories: string[] | null;
  public_url: string | null;
};

export const ITEM_TYPE_LABELS: Record<string, string> = {
  chatter_event: "Chatter event",
  partner_event: "Partner event",
  community_observance: "Community observance",
  heritage_social_justice_moment: "Heritage & social justice",
  winter_outdoor_sports_moment: "Winter & outdoor sports",
  content_campaign: "Campaign",
  fundraiser: "Fundraiser",
  partner_opportunity: "Partner opportunity",
  content_opportunity: "Opportunity",
};

export const CATEGORIES = [
  { value: "lgbtq_community", label: "LGBTQ+ community" },
  { value: "winter_outdoor_sports", label: "Winter & outdoor sports" },
  { value: "community_social_justice", label: "Community & social justice" },
  { value: "chatter_events", label: "Chatter events" },
  { value: "campaigns_fundraising", label: "Campaigns & fundraising" },
  { value: "partner_opportunities", label: "Partner opportunities" },
] as const;

export function categoryLabel(value: string): string {
  return CATEGORIES.find((category) => category.value === value)?.label ?? value;
}
