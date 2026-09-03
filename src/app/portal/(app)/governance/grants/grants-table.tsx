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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
            <p className="app-muted px-4 py-6 text-sm">
              No grants recorded yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Funder</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Deadline</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="w-0">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleGrants.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="app-muted text-center">
                      No grants match your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleGrants.map((grant) => (
                    <TableRow key={grant.id}>
                      <TableCell
                        className="max-w-xs truncate font-medium"
                        title={grant.funder_name}
                      >
                        {grant.funder_name}
                      </TableCell>
                      <TableCell className="app-muted">
                        {formatCurrency(grant.amount)}
                      </TableCell>
                      <TableCell className="app-muted">
                        {formatCalendarDate(grant.application_deadline)}
                      </TableCell>
                      <TableCell>
                        <GrantStatusBadge status={grant.status} />
                      </TableCell>
                      <TableCell className="app-muted">
                        {personDisplayName(grant.owner)}
                      </TableCell>
                      <TableCell>
                        {canManage && (
                          <EditGrantModal grant={grant} people={people} />
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
