"use client";

import { useMemo, useState } from "react";
import { CalendarFiltersSheet } from "./calendar-filters-sheet";
import {
  type CalendarItemRow,
  type CalendarOwner,
  type CalendarProgram,
} from "./calendar-shared";
import type { ProgramSuggestionRule } from "./program-suggestion-shared";
import { ListView, type ListSortColumn } from "./list-view";
import { AgendaView } from "./agenda-view";
import { MonthView } from "./month-view";
import { NewCalendarItemDialog } from "./new-calendar-item-dialog";
import { ViewToggle, type CalendarView } from "./view-toggle";

export function CalendarWorkspace({
  view,
  month,
  items,
  owners,
  programs,
  programSuggestionRules,
  canManage,
  filterQuery,
  sort,
  dir,
  typeFilter,
  categoryFilter,
  priorityFilter,
  programFilter,
  ownerFilter,
  visibilityFilter,
  statusFilter,
  decisionFilter,
}: {
  view: CalendarView;
  month: string;
  items: CalendarItemRow[];
  owners: CalendarOwner[];
  programs: CalendarProgram[];
  programSuggestionRules: ProgramSuggestionRule[];
  canManage: boolean;
  filterQuery: string;
  sort: ListSortColumn;
  dir: "asc" | "desc";
  typeFilter: string;
  categoryFilter: string;
  priorityFilter: string;
  programFilter: string;
  ownerFilter: string;
  visibilityFilter: string;
  statusFilter: string;
  decisionFilter: string;
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

  function viewHrefFor(nextView: CalendarView) {
    const sp = new URLSearchParams(filterQuery);
    sp.set("view", nextView);
    if (nextView === "month") sp.set("month", month);
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
        const windowEnd = new Date(
          now.getTime() + Number(range) * 24 * 60 * 60 * 1000,
        );
        const startsAt = new Date(item.starts_at);
        const endsAt = item.ends_at ? new Date(item.ends_at) : startsAt;
        if (!(startsAt <= windowEnd && endsAt >= now)) return false;
      }
      return true;
    });
  }, [items, search, range]);

  return (
    <div className="flex flex-col gap-3">
      <div className="rainbow-surface flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
        <ViewToggle view={view} hrefFor={viewHrefFor} />

        <div className="flex flex-wrap items-center gap-2">
          <CalendarFiltersSheet
            view={view}
            month={month}
            sort={sort}
            dir={dir}
            owners={owners}
            programs={programs}
            typeFilter={typeFilter}
            categoryFilter={categoryFilter}
            priorityFilter={priorityFilter}
            programFilter={programFilter}
            ownerFilter={ownerFilter}
            visibilityFilter={visibilityFilter}
            statusFilter={statusFilter}
            decisionFilter={decisionFilter}
            search={search}
            onSearchChange={setSearch}
            range={range}
            onRangeChange={setRange}
          />

          {canManage && (
            <NewCalendarItemDialog
              owners={owners}
              programs={programs}
              programSuggestionRules={programSuggestionRules}
            />
          )}
        </div>
      </div>

      {view === "list" && (
        <ListView
          items={filtered}
          owners={owners}
          canManage={canManage}
          sort={sort}
          dir={dir}
          sortHref={sortHref}
        />
      )}
      {view === "agenda" && <AgendaView items={filtered} />}
      {view === "month" && (
        <MonthView month={month} items={filtered} monthHref={monthHref} />
      )}
    </div>
  );
}
