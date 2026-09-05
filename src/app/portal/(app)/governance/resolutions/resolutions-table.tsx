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
import { EditResolutionModal } from "./edit-resolution-modal";
import { VoteOutcomeBadge } from "./resolution-badges";
import type { Resolution } from "./resolutions-actions";
import type { ResolutionMeetingOption } from "./resolutions-shared";
import type { PersonListItem } from "../../people/actions";
import { formatCalendarDate, formatInstantDate } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";

const FILTER_ALL = "all";

function meetingFor(
  meetingId: string | null,
  meetings: ResolutionMeetingOption[],
) {
  if (!meetingId) return null;
  return meetings.find((m) => m.id === meetingId) ?? null;
}

export function ResolutionsTable({
  resolutions,
  people,
  meetings,
  canManage,
  newAction,
}: {
  resolutions: Resolution[];
  people: PersonListItem[];
  meetings: ResolutionMeetingOption[];
  canManage: boolean;
  newAction?: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState(FILTER_ALL);

  const visibleResolutions = useMemo(() => {
    const query = search.trim().toLowerCase();

    return resolutions.filter((resolution) => {
      if (
        outcomeFilter !== FILTER_ALL &&
        resolution.vote_outcome !== outcomeFilter
      )
        return false;
      if (!query) return true;
      return (
        resolution.motion_text.toLowerCase().includes(query) ||
        (resolution.mover.name ?? "").toLowerCase().includes(query)
      );
    });
  }, [resolutions, search, outcomeFilter]);

  const columns = useMemo<PortalDataTableColumn<Resolution>[]>(
    () => [
      {
        key: "motion_text",
        // The motion is a sentence, truncated to fit: nothing a reader would
        // look for in its alphabetical order, so it stays unsorted.
        label: "Motion",
        cellClassName: "max-w-xs truncate font-medium",
        render: (resolution) => (
          <span title={resolution.motion_text}>{resolution.motion_text}</span>
        ),
      },
      {
        key: "mover",
        label: "Mover",
        sortValue: (resolution) => resolution.mover.name,
        cellClassName: "app-muted",
        render: (resolution) => resolution.mover.name ?? "—",
      },
      {
        key: "vote_outcome",
        label: "Vote outcome",
        sortValue: (resolution) => resolution.vote_outcome,
        render: (resolution) => (
          <VoteOutcomeBadge outcome={resolution.vote_outcome} />
        ),
      },
      {
        key: "effective_date",
        label: "Effective date",
        sortValue: (resolution) => resolution.effective_date,
        cellClassName: "app-muted",
        render: (resolution) => formatCalendarDate(resolution.effective_date),
      },
      {
        key: "meeting",
        // Sorted on the meeting's own timestamp rather than the formatted
        // date, so the order is chronological rather than alphabetical.
        label: "Meeting",
        sortValue: (resolution) =>
          meetingFor(resolution.meeting_id, meetings)?.meeting_date,
        cellClassName: "app-muted",
        render: (resolution) => {
          const meeting = meetingFor(resolution.meeting_id, meetings);
          return meeting ? formatInstantDate(meeting.meeting_date) : "—";
        },
      },
      {
        key: "actions",
        label: "Actions",
        srOnlyLabel: true,
        headClassName: "w-0",
        render: (resolution) =>
          canManage ? (
            <EditResolutionModal
              resolution={resolution}
              people={people}
              meetings={meetings}
            />
          ) : null,
      },
    ],
    [canManage, people, meetings],
  );

  return (
    <div className="space-y-4">
      <div className="rainbow-surface flex flex-wrap items-end justify-between gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="resolutions-search"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              Search
            </label>
            <Input
              id="resolutions-search"
              className="w-56"
              placeholder="Search motion or mover..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
              Vote outcome
            </span>
            <Select
              value={outcomeFilter}
              onValueChange={(value) => setOutcomeFilter(value ?? FILTER_ALL)}
            >
              <SelectTrigger aria-label="Filter by vote outcome">
                <SelectValue placeholder="Vote outcome" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL}>All</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="passed">Passed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="tabled">Tabled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {newAction}
      </div>

      {resolutions.length === 0 ? (
        <Card>
          <CardContent className="px-0">
            <EmptyState
              title="No resolutions recorded yet"
              description={
                canManage
                  ? "Add the first one with Add resolution above."
                  : "Resolutions appear here once a governance manager adds them."
              }
            />
          </CardContent>
        </Card>
      ) : (
        // No `defaultSort`: the query orders by creation time, which is not a
        // column here, so the list opens newest-first as it always has and
        // the arrows take over from there.
        <PortalDataTable
          columns={columns}
          rows={visibleResolutions}
          getRowKey={(resolution) => resolution.id}
          emptyMessage="No resolutions match your filters."
        />
      )}
    </div>
  );
}
