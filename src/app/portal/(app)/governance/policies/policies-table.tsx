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
import { EditPolicyModal } from "./edit-policy-modal";
import type { Policy } from "./policies-actions";
import { formatCalendarDate } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";

const FILTER_ALL = "all";

export function PoliciesTable({
  policies,
  canManage,
  newAction,
}: {
  policies: Policy[];
  canManage: boolean;
  newAction?: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(FILTER_ALL);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const policy of policies) {
      if (policy.category) set.add(policy.category);
    }
    return Array.from(set).sort();
  }, [policies]);

  const visiblePolicies = useMemo(() => {
    const query = search.trim().toLowerCase();

    return policies.filter((policy) => {
      if (categoryFilter !== FILTER_ALL && policy.category !== categoryFilter)
        return false;
      if (!query) return true;
      return policy.name.toLowerCase().includes(query);
    });
  }, [policies, search, categoryFilter]);

  const columns = useMemo<PortalDataTableColumn<Policy>[]>(
    () => [
      {
        key: "name",
        label: "Name",
        sortValue: (policy) => policy.name,
        cellClassName: "font-medium",
        render: (policy) => policy.name,
      },
      {
        key: "category",
        label: "Category",
        sortValue: (policy) => policy.category,
        cellClassName: "app-muted",
        render: (policy) => policy.category || "—",
      },
      {
        key: "version",
        label: "Version",
        sortValue: (policy) => policy.version,
        cellClassName: "app-muted",
        render: (policy) => policy.version,
      },
      {
        key: "effective_date",
        label: "Effective date",
        sortValue: (policy) => policy.effective_date,
        cellClassName: "app-muted",
        render: (policy) => formatCalendarDate(policy.effective_date),
      },
      {
        key: "actions",
        label: "Actions",
        srOnlyLabel: true,
        headClassName: "w-0",
        render: (policy) =>
          canManage ? <EditPolicyModal policy={policy} /> : null,
      },
    ],
    [canManage],
  );

  return (
    <div className="space-y-4">
      <div className="rainbow-surface flex flex-wrap items-end justify-between gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="policies-search"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              Search
            </label>
            <Input
              id="policies-search"
              className="w-56"
              placeholder="Search policy name..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
              Category
            </span>
            <Select
              value={categoryFilter}
              onValueChange={(value) => setCategoryFilter(value ?? FILTER_ALL)}
            >
              <SelectTrigger aria-label="Filter by category">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL}>All</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {newAction}
      </div>

      {policies.length === 0 ? (
        <Card>
          <CardContent className="px-0">
            <EmptyState
              title="No policies recorded yet"
              description={
                canManage
                  ? "Add the first one with Add policy above."
                  : "Policies appear here once a governance manager adds them."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <PortalDataTable
          columns={columns}
          rows={visiblePolicies}
          getRowKey={(policy) => policy.id}
          // The query orders by name, then by effective date within a name;
          // this sort is stable, so opening on Name keeps that second key.
          defaultSort={{ key: "name", dir: "asc" }}
          emptyMessage="No policies match your filters."
        />
      )}
    </div>
  );
}
