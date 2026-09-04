import type { GiveawayTierConfig } from "../giveaway-tier-actions";

/**
 * Tickets in the pool, per colour (issue #5). Both entry paths -- donated gear
 * and bought packages -- write into the same pool, so this is the denominator
 * the odds disclosure in the official rules (issue #666) will be computed from.
 */
export function TicketPoolSummary({ config }: { config: GiveawayTierConfig }) {
  if (!config.tiers.length) return null;

  const issued = config.totals.reduce(
    (total, tier) => total + tier.quantity,
    0,
  );
  if (!issued) return null;

  return (
    <section className="rounded-md border border-[var(--line)] p-4">
      <h3 className="text-sm font-medium">Tickets issued</h3>
      <dl className="mt-3 flex flex-wrap gap-6">
        {config.totals.map((total) => (
          <div key={total.tier_id}>
            <dt className="app-muted text-sm">{total.tier_label}</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {total.quantity}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
