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
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
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

  const columns = useMemo<PortalDataTableColumn<TemplateListRow>[]>(
    () => [
      {
        key: "name",
        label: "Name",
        sortValue: (template) => template.name,
        cellClassName: "max-w-xs font-medium",
        render: (template) => (
          <span className="block truncate" title={template.name}>
            {template.name}
          </span>
        ),
      },
      {
        key: "key",
        label: "Key",
        sortValue: (template) => template.key,
        cellClassName: "app-muted",
        render: (template) => template.key,
      },
      {
        key: "version",
        label: "Version",
        // Numeric, so v9 sorts below v10 rather than after it.
        sortValue: (template) => template.version,
        render: (template) => `v${template.version}`,
      },
      {
        key: "is_active",
        label: "Active",
        // The word the cell shows, so ascending groups the "No"s first
        // instead of ordering on a boolean a reader can't see.
        sortValue: (template) => (template.is_active ? "Yes" : "No"),
        cellClassName: "app-muted",
        render: (template) => (template.is_active ? "Yes" : "No"),
      },
      {
        key: "requires_consent",
        label: "Requires consent",
        sortValue: (template) => (template.requires_consent ? "Yes" : "No"),
        cellClassName: "app-muted",
        render: (template) => (template.requires_consent ? "Yes" : "No"),
      },
      {
        key: "actions",
        label: "Actions",
        srOnlyLabel: true,
        headClassName: "w-0",
        cellClassName: "text-right",
        render: (template) => (
          <Button
            variant="ghost"
            size="icon-sm"
            nativeButton={false}
            aria-label={`View ${template.name}`}
            render={<Link href={`/portal/calendar/templates/${template.id}`} />}
          >
            <Eye />
          </Button>
        ),
      },
    ],
    [],
  );

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
        <PortalDataTable
          columns={columns}
          rows={visibleTemplates}
          getRowKey={(template) => template.id}
          // Matches the query's own ordering.
          defaultSort={{ key: "name", dir: "asc" }}
          emptyMessage="No templates match your filters."
        />
      )}
    </div>
  );
}
