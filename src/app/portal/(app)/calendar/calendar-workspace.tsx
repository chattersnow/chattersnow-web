"use client";

import { useMemo, useState } from "react";
import { CalendarFiltersSheet } from "./calendar-filters-sheet";
import { type CalendarOwner, type CalendarProgram } from "./calendar-shared";
import type { CalendarEntry } from "./calendar-entries";
import type { ProgramSuggestionRule } from "./program-suggestion-shared";
import { ListView, type ListSortColumn } from "./list-view";
import { AgendaView } from "./agenda-view";
import { MonthView } from "./month-view";
import { NewCalendarItemDialog } from "./new-calendar-item-dialog";
import { ViewToggle, type CalendarView } from "./view-toggle";

export function CalendarWorkspace({
  view,
  month,
  entries,
  eventsHidden,
  eventsError,
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
  entries: CalendarEntry[];
  /** Events exist for this viewer but the active filters can't express them -- see filtersExcludeEvents. */
  eventsHidden: boolean;
  /** The events read failed, so the grid is calendar items only for a reason the reader must not mistake for an empty schedule. */
  eventsError: boolean;
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

    return entries.filter((entry) => {
      if (query) {
        const haystack = `${entry.title} ${entry.summary ?? ""}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (range !== "all") {
        const windowEnd = new Date(
          now.getTime() + Number(range) * 24 * 60 * 60 * 1000,
        );
        const startsAt = new Date(entry.starts_at);
        const endsAt = entry.ends_at ? new Date(entry.ends_at) : startsAt;
        if (!(startsAt <= windowEnd && endsAt >= now)) return false;
      }
      return true;
    });
  }, [entries, search, range]);

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
            eventsHidden={eventsHidden}
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

      {eventsError && (
        <p className="app-muted text-sm" role="status">
          Chatter events could not be loaded, so this calendar is showing
          content items only.
        </p>
      )}

      {view === "list" && (
        <ListView
          entries={filtered}
          owners={owners}
          canManage={canManage}
          sort={sort}
          dir={dir}
          sortHref={sortHref}
        />
      )}
      {view === "agenda" && <AgendaView entries={filtered} />}
      {view === "month" && (
        <MonthView month={month} entries={filtered} monthHref={monthHref} />
      )}
    </div>
  );
}
