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
import { EditPartnershipModal } from "./edit-partnership-modal";
import { PartnershipStageBadge } from "./partnership-badges";
import { PARTNERSHIP_STAGE_LABELS } from "./partnership-opportunity-form-fields";
import type { PartnershipOpportunity } from "./partnerships-actions";
import type { PersonListItem } from "../../people/actions";
import { formatCalendarDate, personDisplayName } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";

const FILTER_ALL = "all";

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
        (opportunity.organization.name ?? "").toLowerCase().includes(query) ||
        (opportunity.organization.email ?? "").toLowerCase().includes(query)
      );
    });
  }, [opportunities, search, stageFilter]);

  const columns = useMemo<PortalDataTableColumn<PartnershipOpportunity>[]>(
    () => [
      {
        key: "organization",
        label: "Organization",
        sortValue: (opportunity) => opportunity.organization.name,
        cellClassName: "max-w-xs truncate font-medium",
        render: (opportunity) => (
          <span title={opportunity.organization.name ?? undefined}>
            {opportunity.organization.name ?? "—"}
          </span>
        ),
      },
      {
        key: "email",
        label: "Contact email",
        sortValue: (opportunity) => opportunity.organization.email,
        cellClassName: "app-muted",
        render: (opportunity) => opportunity.organization.email ?? "—",
      },
      {
        key: "stage",
        // The label the badge shows, so the order reads the way the column
        // does rather than following the enum's underscored values.
        label: "Stage",
        sortValue: (opportunity) => PARTNERSHIP_STAGE_LABELS[opportunity.stage],
        render: (opportunity) => (
          <PartnershipStageBadge stage={opportunity.stage} />
        ),
      },
      {
        key: "next_step_date",
        label: "Next step",
        sortValue: (opportunity) => opportunity.next_step_date,
        cellClassName: "app-muted",
        render: (opportunity) => formatCalendarDate(opportunity.next_step_date),
      },
      {
        key: "owner",
        label: "Internal owner",
        sortValue: (opportunity) => personDisplayName(opportunity.owner),
        cellClassName: "app-muted",
        render: (opportunity) => personDisplayName(opportunity.owner),
      },
      {
        key: "actions",
        label: "Actions",
        srOnlyLabel: true,
        headClassName: "w-0",
        render: (opportunity) =>
          canManage ? (
            <EditPartnershipModal opportunity={opportunity} people={people} />
          ) : null,
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
            <EmptyState
              title="No partnership opportunities recorded yet"
              description={
                canManage
                  ? "Add the first one with Add opportunity above."
                  : "Opportunities appear here once a governance manager adds them."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <PortalDataTable
          columns={columns}
          rows={visibleOpportunities}
          getRowKey={(opportunity) => opportunity.id}
          // The query orders by next step date, soonest first, with the ones
          // that have no date last -- which is where this table's own
          // blanks-last rule puts them too.
          defaultSort={{ key: "next_step_date", dir: "asc" }}
          emptyMessage="No opportunities match your filters."
        />
      )}
    </div>
  );
}
