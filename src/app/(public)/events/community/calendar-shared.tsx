export type PublicCalendarItem = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  time_zone: string;
  summary: string | null;
  categories: string[] | null;
  public_url: string | null;
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
  return (
    CATEGORIES.find((category) => category.value === value)?.label ?? value
  );
}
