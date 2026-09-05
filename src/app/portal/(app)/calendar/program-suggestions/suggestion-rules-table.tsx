"use client";

import { ReactNode, useCallback, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { FiltersSheet } from "@/components/filters-sheet";
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
import { CATEGORIES, ITEM_TYPES, labelFor } from "../calendar-shared";
import type { Program } from "../../programs/actions";
import {
  SuggestionRuleDetailsSheet,
  type SuggestionRuleListRow,
} from "./suggestion-rule-details-sheet";
import { EmptyState } from "@/components/portal/empty-state";

const FILTER_ALL = "all";

export function SuggestionRulesTable({
  rules,
  programs,
  canManage,
  newAction,
}: {
  rules: SuggestionRuleListRow[];
  programs: Program[];
  canManage: boolean;
  newAction?: ReactNode;
}) {
  const [programFilter, setProgramFilter] = useState(FILTER_ALL);
  const [activeFilter, setActiveFilter] = useState(FILTER_ALL);

  // Stable, so the column list below only rebuilds when the programs it
  // resolves names from change.
  const programName = useCallback(
    (programId: string) =>
      programs.find((program) => program.id === programId)?.name ?? "—",
    [programs],
  );

  const visibleRules = useMemo(() => {
    return rules.filter((rule) => {
      if (programFilter !== FILTER_ALL && rule.program_id !== programFilter)
        return false;
      if (activeFilter === "active" && !rule.is_active) return false;
      if (activeFilter === "inactive" && rule.is_active) return false;
      return true;
    });
  }, [rules, programFilter, activeFilter]);

  const activeFilterCount = [
    programFilter !== FILTER_ALL,
    activeFilter !== FILTER_ALL,
  ].filter(Boolean).length;

  const columns = useMemo<PortalDataTableColumn<SuggestionRuleListRow>[]>(
    () => [
      {
        key: "item_type",
        label: "Item type",
        // On the word the cell shows, "Any" included: a rule that matches
        // every type is a real value a reader sorts by, not a blank.
        sortValue: (rule) =>
          rule.item_type ? labelFor(ITEM_TYPES, rule.item_type) : "Any",
        cellClassName: "app-muted",
        render: (rule) =>
          rule.item_type ? labelFor(ITEM_TYPES, rule.item_type) : "Any",
      },
      {
        key: "category",
        label: "Category",
        sortValue: (rule) =>
          rule.category ? labelFor(CATEGORIES, rule.category) : "Any",
        cellClassName: "app-muted",
        render: (rule) =>
          rule.category ? labelFor(CATEGORIES, rule.category) : "Any",
      },
      {
        key: "program",
        label: "Program",
        sortValue: (rule) => programName(rule.program_id),
        cellClassName: "font-medium",
        render: (rule) => programName(rule.program_id),
      },
      {
        key: "note",
        // Truncated free text: there is nothing a reader would look for in
        // its alphabetical order, so it stays unsorted.
        label: "Note",
        cellClassName: "max-w-xs truncate app-muted",
        render: (rule) => rule.note || "—",
      },
      {
        key: "is_active",
        label: "Active",
        // The word the cell shows, so ascending groups the "No"s first
        // instead of ordering on a boolean a reader can't see.
        sortValue: (rule) => (rule.is_active ? "Yes" : "No"),
        cellClassName: "app-muted",
        render: (rule) => (rule.is_active ? "Yes" : "No"),
      },
      {
        key: "actions",
        label: "Actions",
        srOnlyLabel: true,
        headClassName: "w-0",
        cellClassName: "text-right",
        render: (rule) => (
          <SuggestionRuleDetailsSheet
            rule={rule}
            programs={programs}
            canManage={canManage}
          />
        ),
      },
    ],
    [programs, programName, canManage],
  );

  return (
    <div className="space-y-4">
      <div className="rainbow-surface flex flex-wrap items-center justify-end gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
        <FiltersSheet activeCount={activeFilterCount}>
          <div className="flex flex-col gap-1">
            <span className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
              Program
            </span>
            <Select
              value={programFilter}
              onValueChange={(value) => setProgramFilter(value ?? FILTER_ALL)}
            >
              <SelectTrigger aria-label="Filter by program">
                <SelectValue placeholder="Program" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL}>All</SelectItem>
                {programs.map((program) => (
                  <SelectItem key={program.id} value={program.id}>
                    {program.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

      {rules.length === 0 ? (
        <Card>
          <CardContent className="px-0">
            <EmptyState
              title="No rules yet"
              description={
                canManage
                  ? "Add the first one with New rule above."
                  : "Rules appear here once a calendar manager adds them."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <PortalDataTable
          columns={columns}
          rows={visibleRules}
          getRowKey={(rule) => rule.id}
          // No default sort: the rules arrive in the order they were
          // created, which is not one of the columns, so the list keeps that
          // order until the reader picks another.
          emptyMessage="No rules match your filters."
        />
      )}
    </div>
  );
}
