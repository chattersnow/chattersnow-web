import type { Giveaway } from "../giveaway-actions";
import type { GiveawayTierConfig } from "../giveaway-tier-actions";
import { legacyGiveawayFigures } from "./ticket-sales";
import { formatCurrency, formatCalendarDate } from "@/lib/format";

/**
 * The giveaway at a glance: the handful of numbers that move while the event
 * runs, on one line. It replaces the stacked read-only field list plus the
 * separate ticket-pool card, which between them spent most of a screen on six
 * values. Per-colour counts only appear once tickets have actually been
 * issued -- before that they are six zeroes saying nothing.
 *
 * Tickets sold and revenue are counted from the recorded ticket sales (#1577),
 * not typed. A figure hand-entered before that is shown beneath, read-only.
 */
export function GiveawaySummaryStrip({
  giveaway,
  config,
}: {
  giveaway: Giveaway;
  config: GiveawayTierConfig | null;
}) {
  const issued = config?.totals ?? [];
  const hasTickets = issued.some((total) => total.quantity > 0);
  const legacy = legacyGiveawayFigures(giveaway);

  const stats: { label: string; value: string }[] = [
    {
      label: "Tickets sold",
      value: config ? String(config.sales.ticketsSold) : "—",
    },
    {
      label: "Revenue",
      value: config ? formatCurrency(config.sales.revenue) : "—",
    },
    { label: "Drawing date", value: formatCalendarDate(giveaway.drawing_date) },
    ...(hasTickets
      ? issued.map((total) => ({
          label: `${total.tier_label} issued`,
          value: String(total.quantity),
        }))
      : []),
  ];

  return (
    <section className="rounded-md border border-[var(--line)] p-4">
      <h3 className="text-base font-medium">
        {giveaway.name || "Untitled giveaway"}
      </h3>

      <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-3">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col gap-1">
            <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {stat.label}
            </dt>
            <dd className="text-sm tabular-nums">{stat.value}</dd>
          </div>
        ))}
      </dl>

      {legacy && (
        <p className="app-muted mt-3 text-xs">
          Entered by hand before ticket sales were recorded:{" "}
          {legacy.ticketsSold} tickets, {formatCurrency(legacy.revenue)}.
        </p>
      )}

      {giveaway.notes && (
        <p className="app-muted mt-4 border-t border-[var(--line)] pt-3 text-sm">
          {giveaway.notes}
        </p>
      )}
    </section>
  );
}
