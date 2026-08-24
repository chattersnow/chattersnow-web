"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { addDays } from "@/lib/time";
import { CalendarItemDetailsDialog } from "./calendar-item-details-dialog";
import type { CalendarItemRow, CalendarOwner, CalendarProgram } from "./calendar-shared";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_CHIPS_PER_DAY = 3;

function parseMonthParam(month: string): Date {
  const [year, monthNum] = month.split("-").map(Number);
  return new Date(year || new Date().getFullYear(), (monthNum || 1) - 1, 1);
}

function ymd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function MonthView({
  month,
  items,
  owners,
  programs,
  canManage,
  monthHref,
}: {
  month: string;
  items: CalendarItemRow[];
  owners: CalendarOwner[];
  programs: CalendarProgram[];
  canManage: boolean;
  monthHref: (month: string) => string;
}) {
  const monthStart = parseMonthParam(month);
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
  const gridStart = addDays(monthStart, -monthStart.getDay());
  const gridEnd = addDays(monthEnd, 6 - monthEnd.getDay());

  const days: Date[] = [];
  for (let day = new Date(gridStart); day <= gridEnd; day = addDays(day, 1)) {
    days.push(new Date(day));
  }

  const itemsByDay = new Map<string, CalendarItemRow[]>();
  for (const item of items) {
    const key = ymd(new Date(item.starts_at));
    const list = itemsByDay.get(key);
    if (list) list.push(item);
    else itemsByDay.set(key, [item]);
  }

  const prevMonth = ymd(addDays(monthStart, -1)).slice(0, 7);
  const nextMonth = ymd(addDays(monthEnd, 1)).slice(0, 7);
  const monthLabel = monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <Card className="mt-6">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Previous month"
            nativeButton={false}
            render={<Link href={monthHref(prevMonth)} />}
          >
            <ChevronLeft />
          </Button>
          <h2 className="text-sm font-semibold">{monthLabel}</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Next month"
            nativeButton={false}
            render={<Link href={monthHref(nextMonth)} />}
          >
            <ChevronRight />
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border text-xs">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="bg-muted px-2 py-1 text-center font-semibold">
              {label}
            </div>
          ))}
          {days.map((day) => {
            const key = ymd(day);
            const dayItems = itemsByDay.get(key) ?? [];
            const inMonth = day.getMonth() === monthStart.getMonth();
            return (
              <div key={key} className={`min-h-24 bg-card p-1 ${inMonth ? "" : "opacity-40"}`}>
                <div className="app-muted px-1 text-[0.7rem]">{day.getDate()}</div>
                <div className="flex flex-col gap-0.5">
                  {dayItems.slice(0, MAX_CHIPS_PER_DAY).map((item) => (
                    <CalendarItemDetailsDialog
                      key={item.id}
                      item={item}
                      owners={owners}
                      programs={programs}
                      canManage={canManage}
                      trigger="chip"
                    />
                  ))}
                  {dayItems.length > MAX_CHIPS_PER_DAY && (
                    <span className="app-muted px-1 text-[0.7rem]">
                      +{dayItems.length - MAX_CHIPS_PER_DAY} more
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
