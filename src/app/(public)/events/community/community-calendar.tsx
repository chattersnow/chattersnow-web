"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateInZone } from "@/lib/time";
import { CalendarListView } from "./calendar-list-view";
import { currentMonthKey, CalendarMonthView } from "./calendar-month-view";
import {
  CATEGORIES,
  categoryLabel,
  type PublicCalendarItem,
} from "./calendar-shared";

const FILTER_ALL = "all";

function monthOptionLabel(month: string) {
  const [year, monthNum] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(new Date(year, monthNum - 1, 1));
}

export function CommunityCalendar({
  items,
  now,
}: {
  items: PublicCalendarItem[];
  now: number;
}) {
  const [viewMode, setViewMode] = useState<"list" | "month">("list");
  const [categoryFilter, setCategoryFilter] = useState(FILTER_ALL);
  const [selectedMonth, setSelectedMonth] = useState(FILTER_ALL);

  const monthOptions = useMemo(() => {
    const keys = new Set(
      items.map((item) =>
        formatDateInZone(new Date(item.starts_at), item.time_zone).slice(0, 7),
      ),
    );
    return Array.from(keys).sort();
  }, [items]);

  const activeMonth =
    viewMode === "month" && selectedMonth === FILTER_ALL
      ? currentMonthKey()
      : selectedMonth;

  const visibleItems = useMemo(() => {
    return items.filter((item) => {
      if (
        categoryFilter !== FILTER_ALL &&
        !(item.categories ?? []).includes(categoryFilter)
      ) {
        return false;
      }
      if (activeMonth !== FILTER_ALL) {
        const itemMonth = formatDateInZone(
          new Date(item.starts_at),
          item.time_zone,
        ).slice(0, 7);
        if (itemMonth !== activeMonth) return false;
      }
      return true;
    });
  }, [items, categoryFilter, activeMonth]);

  if (items.length === 0) {
    return (
      <p className="app-muted py-16 text-center text-sm">
        The community calendar doesn&apos;t have any published items yet. Check
        back soon.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rainbow-surface flex flex-wrap items-end gap-4 rounded-xl border border-[var(--line)] p-4 shadow-md">
        <div className="flex flex-col gap-1">
          <span className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
            View
          </span>
          <div
            role="group"
            aria-label="Calendar view"
            className="flex overflow-hidden rounded-lg border border-input bg-card"
          >
            <Button
              type="button"
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={viewMode === "list"}
              className="rounded-none"
              onClick={() => setViewMode("list")}
            >
              List
            </Button>
            <Button
              type="button"
              variant={viewMode === "month" ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={viewMode === "month"}
              className="rounded-none"
              onClick={() => setViewMode("month")}
            >
              Month
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="community-calendar-category-filter"
            className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
          >
            Category
          </label>
          <Select
            value={categoryFilter}
            onValueChange={(value) => setCategoryFilter(value ?? FILTER_ALL)}
          >
            <SelectTrigger
              id="community-calendar-category-filter"
              className="h-8 w-56 bg-card"
            >
              <SelectValue placeholder="Category">
                {(value: string) =>
                  value === FILTER_ALL ? "All categories" : categoryLabel(value)
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_ALL}>All categories</SelectItem>
              {CATEGORIES.map((category) => (
                <SelectItem key={category.value} value={category.value}>
                  {category.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {viewMode === "list" && (
          <div className="flex flex-col gap-1">
            <label
              htmlFor="community-calendar-month-filter"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              Month
            </label>
            <Select
              value={selectedMonth}
              onValueChange={(value) => setSelectedMonth(value ?? FILTER_ALL)}
            >
              <SelectTrigger
                id="community-calendar-month-filter"
                className="h-8 bg-card"
              >
                <SelectValue placeholder="Month">
                  {(value: string) =>
                    value === FILTER_ALL
                      ? "All months"
                      : monthOptionLabel(value)
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL}>All months</SelectItem>
                {monthOptions.map((month) => (
                  <SelectItem key={month} value={month}>
                    {monthOptionLabel(month)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {viewMode === "list" ? (
        <CalendarListView items={visibleItems} now={now} />
      ) : (
        <CalendarMonthView
          items={visibleItems}
          month={activeMonth}
          onMonthChange={setSelectedMonth}
        />
      )}
    </div>
  );
}
