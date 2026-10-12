import { toNumber } from "@/lib/portal/impact-metrics";

export type GiveawayTicketSalesSummary = {
  /** Sales recorded: one per purchase, however many packages it bought. */
  sales: number;
  /** Tickets those sales issued, summed from their grants. */
  ticketsSold: number;
  /** Money taken, summed from the sales' recorded amounts. */
  revenue: number;
};

/**
 * The giveaway's sales figures, from what was actually recorded (#1577). They
 * replace the hand-typed `tickets_sold` and `revenue_amount`, which could only
 * ever drift from the ticket sales beside them. Tickets come from the grants a
 * sale issued rather than `quantity * bundle_quantity`, so repricing or
 * resizing a package later cannot rewrite a past sale's count.
 */
export function summarizeTicketSales(
  sales: { amount: number | string }[],
  saleGrants: { quantity: number }[],
): GiveawayTicketSalesSummary {
  return {
    sales: sales.length,
    ticketsSold: saleGrants.reduce((total, grant) => total + grant.quantity, 0),
    revenue: sales.reduce((total, sale) => total + toNumber(sale.amount), 0),
  };
}

/**
 * The hand-entered figures retired by #1577, when there are any. Kept on the
 * row as an archive and shown read-only, since some may sit in filed reports.
 */
export function legacyGiveawayFigures(giveaway: {
  tickets_sold: number | null;
  revenue_amount: number | string | null;
}): { ticketsSold: number; revenue: number } | null {
  const ticketsSold = toNumber(giveaway.tickets_sold);
  const revenue = toNumber(giveaway.revenue_amount);
  return ticketsSold > 0 || revenue > 0 ? { ticketsSold, revenue } : null;
}
