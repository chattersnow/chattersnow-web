"use client";

import { Card, CardContent } from "@/components/ui/card";
import { formatDateInZone } from "@/lib/time";
import { CalendarItemDetailsSheet } from "./calendar-item-details-sheet";
import {
  CalendarStatusBadge,
  NeedsDecisionFlag,
  PastUndecidedFlag,
  PriorityTierBadge,
} from "./calendar-badges";
import {
  isPastUndecided,
  labelFor,
  needsDecision,
  ITEM_TYPES,
  type CalendarItemRow,
  type CalendarOwner,
  type CalendarProgram,
} from "./calendar-shared";

const dayHeadingFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});
const timeFormatter = new Intl.DateTimeFormat("en-US", { timeStyle: "short" });

function groupByDay(items: CalendarItemRow[]): { dayKey: string; items: CalendarItemRow[] }[] {
  const groups = new Map<string, CalendarItemRow[]>();
  for (const item of items) {
    const dayKey = formatDateInZone(new Date(item.starts_at), item.time_zone || "UTC");
    const existing = groups.get(dayKey);
    if (existing) existing.push(item);
    else groups.set(dayKey, [item]);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dayKey, dayItems]) => ({ dayKey, items: dayItems }));
}

export function AgendaView({
  items,
  owners,
  programs,
  defaultLeadTimeDays,
  canManage,
}: {
  items: CalendarItemRow[];
  owners: CalendarOwner[];
  programs: CalendarProgram[];
  defaultLeadTimeDays: number;
  canManage: boolean;
}) {
  const groups = groupByDay(items);

  if (groups.length === 0) {
    return (
      <Card className="mt-6">
        <CardContent className="px-4 py-6">
          <p className="app-muted text-sm">No calendar items match these filters.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      {groups.map(({ dayKey, items: dayItems }) => (
        <Card key={dayKey}>
          <CardContent className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">
              {dayHeadingFormatter.format(new Date(`${dayKey}T00:00:00`))}
            </h2>
            <div className="flex flex-col divide-y divide-border">
              {dayItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{item.title}</span>
                      <PriorityTierBadge tier={item.priority_tier} />
                      <CalendarStatusBadge status={item.calendar_status} />
                    </div>
                    <p className="app-muted text-xs">
                      {timeFormatter.format(new Date(item.starts_at))} · {labelFor(ITEM_TYPES, item.item_type)}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {needsDecision(item) && <NeedsDecisionFlag />}
                      {isPastUndecided(item) && <PastUndecidedFlag />}
                    </div>
                  </div>
                  <CalendarItemDetailsSheet
                    item={item}
                    owners={owners}
                    programs={programs}
                    defaultLeadTimeDays={defaultLeadTimeDays}
                    canManage={canManage}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
