export type RevenueSource =
  | "ticket_sales"
  | "registration_fees"
  | "merchandise"
  | "onsite_donations"
  | "grants"
  | "other";

export const REVENUE_SOURCES: readonly RevenueSource[] = [
  "ticket_sales",
  "registration_fees",
  "merchandise",
  "onsite_donations",
  "grants",
  "other",
];

export function isRevenueSource(
  value: string | undefined,
): value is RevenueSource {
  return !!value && (REVENUE_SOURCES as readonly string[]).includes(value);
}

const SOURCE_LABELS: Record<RevenueSource, string> = {
  ticket_sales: "Ticket sales",
  registration_fees: "Registration fees",
  merchandise: "Merchandise",
  onsite_donations: "Onsite donations",
  grants: "Grants",
  other: "Other",
};

export function revenueSourceLabel(source: RevenueSource): string {
  return SOURCE_LABELS[source] ?? source;
}

export type RevenueRow = {
  id: string;
  event_id: string | null;
  source: RevenueSource;
  amount: number | string;
  received_date: string;
  notes: string | null;
  events: { name: string } | null;
};

export type EventOption = { id: string; name: string };

export const REVENUE_COLUMNS =
  "id, event_id, source, amount, received_date, notes, events(name)";
