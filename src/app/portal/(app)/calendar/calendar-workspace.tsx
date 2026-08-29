"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { HowToSection, HowToSheet } from "@/components/how-to-sheet";
import { CalendarFiltersSheet } from "./calendar-filters-sheet";
import {
  type CalendarItemRow,
  type CalendarOwner,
  type CalendarProgram,
} from "./calendar-shared";
import type { ActiveContentBriefTemplate } from "./content-brief-template-shared";
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
  activeTemplates,
  defaultLeadTimeDays,
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
  activeTemplates: ActiveContentBriefTemplate[];
  defaultLeadTimeDays: number;
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
      <div className="rainbow-surface flex flex-wrap items-end justify-between gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
        <div className="flex flex-wrap items-end gap-3">
          <HowToSheet title="How calendar items work">
            <HowToSection heading="Steps">
              <ol className="list-decimal space-y-2 pl-4">
                <li>
                  <strong className="text-foreground">Priority tier</strong> —
                  Tier 1 items need an explicit Plan, Skip, or Defer decision
                  before their date passes (once it&apos;s Tier 1, undecided,
                  and not archived, the item is flagged as needing one). Tiers 2
                  and 3 don&apos;t require a decision.
                </li>
                <li>
                  <strong className="text-foreground">Sensitive topic</strong> —
                  flagging an item this way surfaces tone guidance and requires
                  someone with manage access to record a review before it&apos;s
                  considered handled; unreviewed sensitive items are flagged the
                  same way as undecided Tier 1 items.
                </li>
                <li>
                  <strong className="text-foreground">
                    Content opportunity
                  </strong>{" "}
                  — items with a linked content opportunity move through their
                  own draft/review/publish stages, tracked on the{" "}
                  <Link
                    href="/portal/calendar/work-queue"
                    className="underline hover:text-foreground"
                  >
                    Work queue
                  </Link>{" "}
                  page.
                </li>
              </ol>
            </HowToSection>
            <HowToSection heading="Who can do this">
              <p>
                Anyone with manage access to the content calendar can create or
                edit items and record decisions and sensitive-topic reviews;
                everyone else can view.
              </p>
            </HowToSection>
            <HowToSection heading="What happens downstream">
              <ul className="list-disc space-y-2 pl-4">
                <li>
                  An undecided Tier 1 item or an unreviewed sensitive item stays
                  flagged on this list until it&apos;s handled.
                </li>
                <li>
                  Every create, edit, or delete on a calendar item is written to
                  the audit log.
                </li>
                <li>
                  Items that also have a content opportunity feed the Work
                  queue&apos;s due dates — see that page&apos;s own guide for
                  how those stages work.
                </li>
              </ul>
            </HowToSection>
            <HowToSection heading="Common mistakes">
              <ul className="list-disc space-y-2 pl-4">
                <li>
                  Marking an item sensitive without also recording a review
                  leaves it flagged even after everything else about it is
                  finished.
                </li>
                <li>
                  Deciding Skip or Defer on a Tier 1 item after its date has
                  already passed doesn&apos;t retroactively clear it from
                  history — decide before the date when possible.
                </li>
              </ul>
            </HowToSection>
          </HowToSheet>

          {canManage && (
            <NewCalendarItemDialog
              owners={owners}
              programs={programs}
              programSuggestionRules={programSuggestionRules}
            />
          )}

          <ViewToggle view={view} hrefFor={viewHrefFor} />
        </div>

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
      </div>

      {view === "list" && (
        <ListView
          items={filtered}
          owners={owners}
          programs={programs}
          activeTemplates={activeTemplates}
          defaultLeadTimeDays={defaultLeadTimeDays}
          programSuggestionRules={programSuggestionRules}
          canManage={canManage}
          sort={sort}
          dir={dir}
          sortHref={sortHref}
        />
      )}
      {view === "agenda" && (
        <AgendaView
          items={filtered}
          owners={owners}
          programs={programs}
          activeTemplates={activeTemplates}
          defaultLeadTimeDays={defaultLeadTimeDays}
          programSuggestionRules={programSuggestionRules}
          canManage={canManage}
        />
      )}
      {view === "month" && (
        <MonthView
          month={month}
          items={filtered}
          owners={owners}
          programs={programs}
          activeTemplates={activeTemplates}
          defaultLeadTimeDays={defaultLeadTimeDays}
          programSuggestionRules={programSuggestionRules}
          canManage={canManage}
          monthHref={monthHref}
        />
      )}
    </div>
  );
}
