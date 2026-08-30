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
import { EditPartnershipModal } from "./edit-partnership-modal";
import { PartnershipStageBadge } from "./partnership-badges";
import { PARTNERSHIP_STAGE_LABELS } from "./partnership-opportunity-form-fields";
import type { PartnershipOpportunity } from "./partnerships-actions";
import type { PersonListItem } from "../../people/actions";

const FILTER_ALL = "all";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

function formatDate(value: string | null) {
  if (!value) return "—";
  return dateFormatter.format(new Date(value));
}

export function PartnershipsTable({
  opportunities,
  people,
  canManage,
  newAction,
}: {
  opportunities: PartnershipOpportunity[];
  people: PersonListItem[];
  canManage: boolean;
  newAction?: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState(FILTER_ALL);

  const visibleOpportunities = useMemo(() => {
    const query = search.trim().toLowerCase();

    return opportunities.filter((opportunity) => {
      if (stageFilter !== FILTER_ALL && opportunity.stage !== stageFilter)
        return false;
      if (!query) return true;
      return (
        opportunity.organization_name.toLowerCase().includes(query) ||
        (opportunity.contact_name ?? "").toLowerCase().includes(query)
      );
    });
  }, [opportunities, search, stageFilter]);

  return (
    <div className="space-y-4">
      <div className="rainbow-surface flex flex-wrap items-end justify-between gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="partnerships-search"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              Search
            </label>
            <Input
              id="partnerships-search"
              className="w-56"
              placeholder="Search organization or contact..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
              Stage
            </span>
            <Select
              value={stageFilter}
              onValueChange={(value) => setStageFilter(value ?? FILTER_ALL)}
            >
              <SelectTrigger aria-label="Filter by stage">
                <SelectValue placeholder="Stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL}>All</SelectItem>
                {Object.entries(PARTNERSHIP_STAGE_LABELS).map(
                  ([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        {newAction}
      </div>

      {opportunities.length === 0 ? (
        <Card>
          <CardContent className="px-0">
            <p className="app-muted px-4 py-6 text-sm">
              No partnership opportunities recorded yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Next step</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="w-0">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleOpportunities.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="app-muted text-center">
                      No opportunities match your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleOpportunities.map((opportunity) => (
                    <TableRow key={opportunity.id}>
                      <TableCell
                        className="max-w-xs truncate font-medium"
                        title={opportunity.organization_name}
                      >
                        {opportunity.organization_name}
                      </TableCell>
                      <TableCell className="app-muted">
                        {opportunity.contact_name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <PartnershipStageBadge stage={opportunity.stage} />
                      </TableCell>
                      <TableCell className="app-muted">
                        {formatDate(opportunity.next_step_date)}
                      </TableCell>
                      <TableCell className="app-muted">
                        {opportunity.owner?.name ?? "—"}
                      </TableCell>
                      <TableCell>
                        {canManage && (
                          <EditPartnershipModal
                            opportunity={opportunity}
                            people={people}
                          />
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
