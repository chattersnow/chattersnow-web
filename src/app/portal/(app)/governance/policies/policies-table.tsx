"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { FiltersSheet } from "@/components/filters-sheet";
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

const FILTER_ALL = "all";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

function formatDate(value: string | null) {
  if (!value) return "—";
  return dateFormatter.format(new Date(value));
}

export function PoliciesTable({
  policies,
  canManage,
}: {
  policies: Policy[];
  canManage: boolean;
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

  const activeFilterCount = [
    search.trim() !== "",
    categoryFilter !== FILTER_ALL,
  ].filter(Boolean).length;

  if (policies.length === 0) {
    return (
      <Card>
        <CardContent className="px-0">
          <p className="app-muted px-4 py-6 text-sm">
            No policies recorded yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <FiltersSheet activeCount={activeFilterCount}>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="policies-search"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              Search
            </label>
            <Input
              id="policies-search"
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
        </FiltersSheet>
      </div>

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
                    <TableCell className="font-medium">{policy.name}</TableCell>
                    <TableCell className="app-muted">
                      {policy.category || "—"}
                    </TableCell>
                    <TableCell className="app-muted">
                      {policy.version}
                    </TableCell>
                    <TableCell className="app-muted">
                      {formatDate(policy.effective_date)}
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
    </div>
  );
}
