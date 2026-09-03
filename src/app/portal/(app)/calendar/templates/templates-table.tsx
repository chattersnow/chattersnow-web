"use client";

import { ReactNode, useMemo, useState } from "react";
import Link from "next/link";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import type { TemplateListRow } from "./template-shared";
import { EmptyState } from "@/components/portal/empty-state";

const FILTER_ALL = "all";

export function TemplatesTable({
  templates,
  newAction,
}: {
  templates: TemplateListRow[];
  newAction?: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState(FILTER_ALL);

  const visibleTemplates = useMemo(() => {
    const query = search.trim().toLowerCase();

    return templates.filter((template) => {
      if (activeFilter === "active" && !template.is_active) return false;
      if (activeFilter === "inactive" && template.is_active) return false;
      if (!query) return true;
      return (
        template.name.toLowerCase().includes(query) ||
        template.key.toLowerCase().includes(query)
      );
    });
  }, [templates, search, activeFilter]);

  const activeFilterCount = [
    search.trim() !== "",
    activeFilter !== FILTER_ALL,
  ].filter(Boolean).length;

  return (
    <div className="space-y-4">
      <div className="rainbow-surface flex flex-wrap items-center justify-end gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
        <FiltersSheet activeCount={activeFilterCount}>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="templates-search"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              Search
            </label>
            <Input
              id="templates-search"
              placeholder="Search name or key..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
              Status
            </span>
            <Select
              value={activeFilter}
              onValueChange={(value) => setActiveFilter(value ?? FILTER_ALL)}
            >
              <SelectTrigger aria-label="Filter by status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL}>All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </FiltersSheet>

        {newAction}
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="px-0">
            <EmptyState
              title="No templates yet"
              description={
                newAction
                  ? "Add the first one with New template above."
                  : "Templates appear here once a calendar manager adds them."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Requires consent</TableHead>
                  <TableHead className="w-px" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleTemplates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="app-muted text-center">
                      No templates match your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleTemplates.map((template) => (
                    <TableRow key={template.id}>
                      <TableCell
                        className="max-w-xs truncate font-medium"
                        title={template.name}
                      >
                        {template.name}
                      </TableCell>
                      <TableCell className="app-muted">
                        {template.key}
                      </TableCell>
                      <TableCell>v{template.version}</TableCell>
                      <TableCell className="app-muted">
                        {template.is_active ? "Yes" : "No"}
                      </TableCell>
                      <TableCell className="app-muted">
                        {template.requires_consent ? "Yes" : "No"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          nativeButton={false}
                          aria-label={`View ${template.name}`}
                          render={
                            <Link
                              href={`/portal/calendar/templates/${template.id}`}
                            />
                          }
                        >
                          <Eye />
                        </Button>
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
