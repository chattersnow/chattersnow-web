"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RANGES, type CalendarItemRow, type CalendarOwner, type CalendarProgram } from "./calendar-shared";
import { ListView, type ListSortColumn } from "./list-view";
import { AgendaView } from "./agenda-view";
import { MonthView } from "./month-view";
import type { CalendarView } from "./view-toggle";

export function CalendarWorkspace({
  view,
  month,
  items,
  owners,
  programs,
  canManage,
  filterQuery,
  sort,
  dir,
}: {
  view: CalendarView;
  month: string;
  items: CalendarItemRow[];
  owners: CalendarOwner[];
  programs: CalendarProgram[];
  canManage: boolean;
  filterQuery: string;
  sort: ListSortColumn;
  dir: "asc" | "desc";
}) {
  const [search, setSearch] = useState("");
  const [range, setRange] = useState("all");

  function sortHref(column: ListSortColumn) {
    const nextDir = sort === column && dir === "asc" ? "desc" : "asc";
    const sp = new URLSearchParams(filterQuery);
    sp.set("view", view);
    sp.set("sort", column);
    sp.set("dir", nextDir);
    return `/portal/calendar?${sp.toString()}`;
  }

  function monthHref(nextMonth: string) {
    const sp = new URLSearchParams(filterQuery);
    sp.set("view", "month");
    sp.set("month", nextMonth);
    return `/portal/calendar?${sp.toString()}`;
  }

  const filtered = useMemo(() => {
    const now = new Date();
    const query = search.trim().toLowerCase();

    return items.filter((item) => {
      if (query) {
        const haystack = `${item.title} ${item.summary ?? ""}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (range !== "all") {
        const windowEnd = new Date(now.getTime() + Number(range) * 24 * 60 * 60 * 1000);
        const startsAt = new Date(item.starts_at);
        const endsAt = item.ends_at ? new Date(item.ends_at) : startsAt;
        if (!(startsAt <= windowEnd && endsAt >= now)) return false;
      }
      return true;
    });
  }, [items, search, range]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="calendar-search" className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
            Search
          </label>
          <Input
            id="calendar-search"
            placeholder="Title or summary..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-56"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="calendar-range" className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
            Range
          </label>
          <Select value={range} onValueChange={(value) => setRange(value ?? "all")}>
            <SelectTrigger id="calendar-range" className="w-44">
              <SelectValue placeholder="All upcoming">
                {(value: string) => RANGES.find((option) => option.value === value)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {view === "list" && (
        <ListView
          items={filtered}
          owners={owners}
          programs={programs}
          canManage={canManage}
          sort={sort}
          dir={dir}
          sortHref={sortHref}
        />
      )}
      {view === "agenda" && (
        <AgendaView items={filtered} owners={owners} programs={programs} canManage={canManage} />
      )}
      {view === "month" && (
        <MonthView
          month={month}
          items={filtered}
          owners={owners}
          programs={programs}
          canManage={canManage}
          monthHref={monthHref}
        />
      )}
    </div>
  );
}
