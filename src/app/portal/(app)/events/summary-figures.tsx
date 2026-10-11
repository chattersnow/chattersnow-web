import Link from "next/link";
import type { ReactNode } from "react";
import type { TabValue } from "./event-tabs-config";

/**
 * One figure, optionally linked to the card its rows come from. Shared by the
 * Report card's sections and the summary at the top of each event card
 * (#1586), so a figure looks the same wherever it is shown.
 */
export function Figure({
  eventId,
  card,
  label,
  value,
  caption,
}: {
  eventId?: string;
  card?: TabValue;
  label: string;
  value: string;
  caption?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border p-3">
      <dt className="app-muted text-xs font-medium">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">
        {eventId && card ? (
          <Link
            href={`/portal/events/${eventId}?tab=${card}`}
            className="underline-offset-4 hover:underline"
          >
            {value}
          </Link>
        ) : (
          value
        )}
      </dd>
      {caption && <dd className="app-muted text-xs">{caption}</dd>}
    </div>
  );
}

/**
 * A card's figures at a glance, above its list (#1586). The columns fit the
 * card's width rather than the viewport's, since the same card renders in the
 * event page's grid, alone, and on a phone.
 */
export function CardSummary({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <dl
      aria-label={label}
      className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3"
    >
      {children}
    </dl>
  );
}
