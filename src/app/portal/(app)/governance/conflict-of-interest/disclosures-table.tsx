"use client";

import { ReactNode, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EditDisclosureModal } from "./edit-disclosure-modal";
import type { Disclosure } from "./disclosures-actions";
import type { PersonListItem } from "../../people/actions";
import { formatCalendarDate } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";

export function DisclosuresTable({
  disclosures,
  people,
  canManage,
  newAction,
}: {
  disclosures: Disclosure[];
  people: PersonListItem[];
  canManage: boolean;
  newAction?: ReactNode;
}) {
  const [search, setSearch] = useState("");

  const visibleDisclosures = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return disclosures;
    return disclosures.filter(
      (disclosure) =>
        (disclosure.person.name ?? "").toLowerCase().includes(query) ||
        String(disclosure.disclosure_year).includes(query),
    );
  }, [disclosures, search]);

  const columns = useMemo<PortalDataTableColumn<Disclosure>[]>(
    () => [
      {
        key: "person",
        label: "Person",
        sortValue: (disclosure) => disclosure.person.name,
        cellClassName: "font-medium",
        render: (disclosure) => disclosure.person.name ?? "—",
      },
      {
        key: "disclosure_year",
        label: "Disclosure year",
        sortValue: (disclosure) => disclosure.disclosure_year,
        cellClassName: "app-muted",
        render: (disclosure) => disclosure.disclosure_year,
      },
      {
        key: "on_file_date",
        label: "On-file date",
        sortValue: (disclosure) => disclosure.on_file_date,
        cellClassName: "app-muted",
        render: (disclosure) => formatCalendarDate(disclosure.on_file_date),
      },
      {
        key: "notes",
        // Free prose, truncated: unsorted for the same reason as every other
        // notes column in the portal.
        label: "Notes",
        cellClassName: "app-muted max-w-xs truncate",
        render: (disclosure) => (
          <span title={disclosure.notes ?? undefined}>
            {disclosure.notes || "—"}
          </span>
        ),
      },
      {
        key: "actions",
        label: "Actions",
        srOnlyLabel: true,
        headClassName: "w-0",
        render: (disclosure) =>
          canManage ? (
            <EditDisclosureModal disclosure={disclosure} people={people} />
          ) : null,
      },
    ],
    [canManage, people],
  );

  return (
    <div className="space-y-4">
      <div className="rainbow-surface flex flex-wrap items-end justify-between gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="disclosures-search"
            className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
          >
            Search
          </label>
          <Input
            id="disclosures-search"
            className="w-56"
            placeholder="Search person or year..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {newAction}
      </div>

      {disclosures.length === 0 ? (
        <Card>
          <CardContent className="px-0">
            <EmptyState
              title="No disclosures recorded yet"
              description={
                canManage
                  ? "Add the first one with Add disclosure above."
                  : "Disclosures appear here once a governance manager adds them."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <PortalDataTable
          columns={columns}
          rows={visibleDisclosures}
          getRowKey={(disclosure) => disclosure.id}
          // The query orders by disclosure year, newest first.
          defaultSort={{ key: "disclosure_year", dir: "desc" }}
          emptyMessage="No disclosures match your search."
        />
      )}
    </div>
  );
}
