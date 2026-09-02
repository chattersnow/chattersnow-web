"use client";

import { ReactNode, useMemo, useState } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CATEGORIES, ITEM_TYPES, labelFor } from "../calendar-shared";
import type { Program } from "../../programs/actions";
import {
  SuggestionRuleDetailsSheet,
  type SuggestionRuleListRow,
} from "./suggestion-rule-details-sheet";

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

  const programName = (programId: string) =>
    programs.find((program) => program.id === programId)?.name ?? "—";

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
            <p className="app-muted px-4 py-6 text-sm">No rules yet.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Program</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-px" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRules.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="app-muted text-center">
                      No rules match your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleRules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell className="app-muted">
                        {rule.item_type
                          ? labelFor(ITEM_TYPES, rule.item_type)
                          : "Any"}
                      </TableCell>
                      <TableCell className="app-muted">
                        {rule.category
                          ? labelFor(CATEGORIES, rule.category)
                          : "Any"}
                      </TableCell>
                      <TableCell className="font-medium">
                        {programName(rule.program_id)}
                      </TableCell>
                      <TableCell className="max-w-xs truncate app-muted">
                        {rule.note || "—"}
                      </TableCell>
                      <TableCell className="app-muted">
                        {rule.is_active ? "Yes" : "No"}
                      </TableCell>
                      <TableCell className="text-right">
                        <SuggestionRuleDetailsSheet
                          rule={rule}
                          programs={programs}
                          canManage={canManage}
                        />
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
