export type RevenueSource =
  | "ticket_sales"
  | "registration_fees"
  | "merchandise"
  | "onsite_donations"
  | "grants"
  | "other";

// Every source a row can currently *hold*. `merchandise` stays here -- rows
// predating the register (#908) still carry it, and they have to display,
// filter and validate like any other. What changed in #909 is that nothing
// new may be created with it: pickers offer REVENUE_SOURCE_OPTIONS instead,
// and a database trigger is the actual gate.
export const REVENUE_SOURCES: readonly RevenueSource[] = [
  "ticket_sales",
  "registration_fees",
  "merchandise",
  "onsite_donations",
  "grants",
  "other",
];

/** The sources a new row may be given. Merchandise is sold at the register. */
export const REVENUE_SOURCE_OPTIONS: readonly RevenueSource[] =
  REVENUE_SOURCES.filter((source) => source !== "merchandise");

/** Shown wherever a user is stopped from choosing `merchandise`. */
export const MERCHANDISE_RETIRED_MESSAGE =
  "Merchandise is recorded under Finance > Sales.";

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
