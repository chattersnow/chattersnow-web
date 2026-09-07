import { Alert, AlertDescription } from "@/components/ui/alert";
import type { DonationGiveawayGrant } from "./actions";

/**
 * The "hand these over" panel shown once a donation against a tiered giveaway
 * is saved (issue #5). Deliberately not a toast: this is an instruction the
 * staffer has to act on with the donor still standing there, so it stays on
 * screen until they dismiss it.
 */
export function GiveawayTicketSummary({
  grant,
  untieredCount,
}: {
  grant: DonationGiveawayGrant;
  untieredCount: number;
}) {
  const earned = grant.totals.filter((total) => total.quantity > 0);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">Tickets to hand out</h3>
        <p className="app-muted mt-1 text-sm">
          Earned by this donation. Every item earns its own bundle.
        </p>
      </div>

      {earned.length ? (
        <ul className="divide-y divide-[var(--line)] rounded-md border border-[var(--line)]">
          {earned.map((total) => (
            <li
              key={total.tier_id}
              className="flex items-center justify-between px-4 py-3"
            >
              <span className="text-sm">{total.tier_label}</span>
              <span className="text-lg font-semibold tabular-nums">
                {total.quantity}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Alert>
          <AlertDescription>
            This donation earned no tickets. Check the giveaway&apos;s tier
            setup if that looks wrong.
          </AlertDescription>
        </Alert>
      )}

      {untieredCount > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            {untieredCount === 1
              ? "1 item could not be matched to a tier and earned no tickets."
              : `${untieredCount} items could not be matched to a tier and earned no tickets.`}{" "}
            Set the tier on the item, or add a keyword for its type to the
            giveaway&apos;s tier setup.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
