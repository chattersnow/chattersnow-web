"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Eye } from "lucide-react";
import { formatDueRelative } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import {
  NeedsDecisionFlag,
  PastUndecidedFlag,
  PriorityTierBadge,
} from "./calendar-badges";
import {
  ContentOverdueFlag,
  ChangesRequestedFlag,
  ContentStatusBadge,
} from "./content-opportunity-badges";
import {
  isPastUndecided,
  labelFor,
  needsDecision,
  ownerName,
  ITEM_TYPES,
  type CalendarItemRow,
  type CalendarOwner,
} from "./calendar-shared";
import {
  CONTENT_STATUSES,
  effectiveDueDate,
  isChangesRequestedForMe,
  overdueStage,
} from "./content-opportunity-shared";
import { EmptyState } from "@/components/portal/empty-state";

/**
 * The tabs above this table arrive in different orders -- the queue by due
 * date, "my work" by whichever item changed hands most recently -- so the
 * page says which column the arrow should start on, and says nothing when
 * the order it sorted by isn't a column here.
 */
export type WorkQueueSortKey = "due";

export function WorkQueueTable({
  items,
  owners,
  currentPersonId,
  emptyMessage,
  emptyDescription,
  defaultSort,
}: {
  items: CalendarItemRow[];
  owners: CalendarOwner[];
  currentPersonId: string | null;
  emptyMessage: string;
  emptyDescription: string;
  defaultSort?: { key: WorkQueueSortKey; dir: "asc" | "desc" };
}) {
  const columns = useMemo<PortalDataTableColumn<CalendarItemRow>[]>(
    () => [
      {
        key: "title",
        label: "Title",
        sortValue: (item) => item.title,
        cellClassName: "max-w-xs font-medium",
        render: (item) => {
          const opp = item.content_opportunity;
          const stage = opp ? overdueStage(opp) : null;
          return (
            <div className="flex flex-col gap-1">
              <span className="block truncate" title={item.title}>
                {item.title}
              </span>
              <div className="flex flex-wrap gap-1">
                {needsDecision(item) && <NeedsDecisionFlag />}
                {isPastUndecided(item) && <PastUndecidedFlag />}
                {stage && <ContentOverdueFlag stage={stage} />}
                {opp &&
                  currentPersonId &&
                  isChangesRequestedForMe(opp, currentPersonId) && (
                    <ChangesRequestedFlag />
                  )}
              </div>
            </div>
          );
        },
      },
      {
        key: "item_type",
        label: "Type",
        // On the label the cell shows, not the stored value.
        sortValue: (item) => labelFor(ITEM_TYPES, item.item_type),
        cellClassName: "app-muted",
        render: (item) => labelFor(ITEM_TYPES, item.item_type),
      },
      {
        key: "priority",
        label: "Priority",
        // Numeric, so tier 1 -- the most urgent -- leads an ascending sort.
        sortValue: (item) => item.priority_tier,
        render: (item) => <PriorityTierBadge tier={item.priority_tier} />,
      },
      {
        key: "content_status",
        label: "Content status",
        // On the badge's label, so the order matches the words on screen
        // rather than the underscored values behind them.
        sortValue: (item) =>
          item.content_opportunity
            ? labelFor(
                CONTENT_STATUSES,
                item.content_opportunity.content_status,
              )
            : null,
        render: (item) =>
          item.content_opportunity ? (
            <ContentStatusBadge
              status={item.content_opportunity.content_status}
            />
          ) : (
            <span className="app-muted text-sm">—</span>
          ),
      },
      {
        key: "due",
        label: "Due",
        // The date itself, not the "in 3 days" the cell shows: an ISO date
        // sorts chronologically, and the relative phrasing would not.
        sortValue: (item) =>
          item.content_opportunity
            ? effectiveDueDate(item.content_opportunity)
            : null,
        cellClassName: "app-muted",
        render: (item) => {
          const dueDate = item.content_opportunity
            ? effectiveDueDate(item.content_opportunity)
            : null;
          return dueDate ? formatDueRelative(dueDate) : "—";
        },
      },
      {
        key: "owner",
        label: "Owner",
        // Null rather than the "—" the cell falls back to, so unowned items
        // collect at the end whichever way the column points.
        sortValue: (item) =>
          item.owner_id ? ownerName(owners, item.owner_id) : null,
        cellClassName: "app-muted",
        render: (item) => ownerName(owners, item.owner_id),
      },
      {
        key: "reviewer",
        label: "Reviewer",
        sortValue: (item) =>
          item.content_opportunity?.reviewer_id
            ? ownerName(owners, item.content_opportunity.reviewer_id)
            : null,
        cellClassName: "app-muted",
        render: (item) =>
          item.content_opportunity
            ? ownerName(owners, item.content_opportunity.reviewer_id)
            : "—",
      },
      {
        key: "actions",
        label: "Actions",
        srOnlyLabel: true,
        headClassName: "w-0",
        cellClassName: "text-right",
        render: (item) => (
          <Button
            variant="ghost"
            size="icon-sm"
            nativeButton={false}
            aria-label={`View ${item.title}`}
            render={<Link href={`/portal/calendar/${item.id}`} />}
          >
            <Eye />
          </Button>
        ),
      },
    ],
    [owners, currentPersonId],
  );

  // Distinct from the table's own empty row: each tab has its own sentence
  // for why it is empty, and neither is "the filters excluded everything".
  if (items.length === 0) {
    return (
      <Card className="mt-3">
        <CardContent className="px-0">
          <EmptyState title={emptyMessage} description={emptyDescription} />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mt-3">
      <PortalDataTable
        columns={columns}
        rows={items}
        getRowKey={(item) => item.id}
        defaultSort={defaultSort}
        emptyMessage="No calendar items to show."
      />
    </div>
  );
}
