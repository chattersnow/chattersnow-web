"use client";

import { ReactNode, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EditGrantModal } from "./edit-grant-modal";
import { GrantStatusBadge } from "./grant-badges";
import { GRANT_STATUS_LABELS } from "./grant-form-fields";
import type { Grant } from "./grants-actions";
import type { PersonListItem } from "../../people/actions";
import {
  formatCalendarDate,
  formatCurrency,
  personDisplayName,
} from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";

const FILTER_ALL = "all";

export function GrantsTable({
  grants,
  people,
  canManage,
  newAction,
}: {
  grants: Grant[];
  people: PersonListItem[];
  canManage: boolean;
  newAction?: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(FILTER_ALL);

  const visibleGrants = useMemo(() => {
    const query = search.trim().toLowerCase();

    return grants.filter((grant) => {
      if (statusFilter !== FILTER_ALL && grant.status !== statusFilter)
        return false;
      if (!query) return true;
      return grant.funder_name.toLowerCase().includes(query);
    });
  }, [grants, search, statusFilter]);

  const columns = useMemo<PortalDataTableColumn<Grant>[]>(
    () => [
      {
        key: "funder_name",
        label: "Funder",
        sortValue: (grant) => grant.funder_name,
        cellClassName: "max-w-xs truncate font-medium",
        render: (grant) => (
          <span title={grant.funder_name}>{grant.funder_name}</span>
        ),
      },
      {
        key: "amount",
        // Sorted on the number, not the formatted currency, so $9,000 lands
        // below $10,000 instead of after it.
        label: "Amount",
        sortValue: (grant) => grant.amount,
        cellClassName: "app-muted",
        render: (grant) => formatCurrency(grant.amount),
      },
      {
        key: "application_deadline",
        label: "Deadline",
        sortValue: (grant) => grant.application_deadline,
        cellClassName: "app-muted",
        render: (grant) => formatCalendarDate(grant.application_deadline),
      },
      {
        key: "status",
        // The label a reader sees, so the alphabetical order is the one the
        // badges spell out rather than the enum's underscored values.
        label: "Status",
        sortValue: (grant) => GRANT_STATUS_LABELS[grant.status] ?? grant.status,
        render: (grant) => <GrantStatusBadge status={grant.status} />,
      },
      {
        key: "owner",
        label: "Owner",
        sortValue: (grant) => personDisplayName(grant.owner),
        cellClassName: "app-muted",
        render: (grant) => personDisplayName(grant.owner),
      },
      {
        key: "actions",
        label: "Actions",
        srOnlyLabel: true,
        headClassName: "w-0",
        render: (grant) =>
          canManage ? <EditGrantModal grant={grant} people={people} /> : null,
      },
    ],
    [canManage, people],
  );

  return (
    <div className="space-y-4">
      <div className="rainbow-surface flex flex-wrap items-end justify-between gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="grants-search"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              Search
            </label>
            <Input
              id="grants-search"
              className="w-56"
              placeholder="Search funder..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
              Status
            </span>
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value ?? FILTER_ALL)}
            >
              <SelectTrigger aria-label="Filter by status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL}>All</SelectItem>
                {Object.entries(GRANT_STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {newAction}
      </div>

      {grants.length === 0 ? (
        <Card>
          <CardContent className="px-0">
            <EmptyState
              title="No grants recorded yet"
              description={
                canManage
                  ? "Add the first one with Add grant above."
                  : "Grants appear here once a governance manager adds them."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <PortalDataTable
          columns={columns}
          rows={visibleGrants}
          getRowKey={(grant) => grant.id}
          // The query orders by application deadline, soonest first.
          defaultSort={{ key: "application_deadline", dir: "asc" }}
          emptyMessage="No grants match your filters."
        />
      )}
    </div>
  );
}
