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
import { EditPolicyModal } from "./edit-policy-modal";
import type { Policy } from "./policies-actions";
import { formatCalendarDate } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";

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
            <p className="app-muted px-4 py-6 text-sm">
              No policies recorded yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Effective date</TableHead>
                  <TableHead className="w-0">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiblePolicies.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="app-muted text-center">
                      No policies match your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  visiblePolicies.map((policy) => (
                    <TableRow key={policy.id}>
                      <TableCell className="font-medium">
                        {policy.name}
                      </TableCell>
                      <TableCell className="app-muted">
                        {policy.category || "—"}
                      </TableCell>
                      <TableCell className="app-muted">
                        {policy.version}
                      </TableCell>
                      <TableCell className="app-muted">
                        {formatCalendarDate(policy.effective_date)}
                      </TableCell>
                      <TableCell>
                        {canManage && <EditPolicyModal policy={policy} />}
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
