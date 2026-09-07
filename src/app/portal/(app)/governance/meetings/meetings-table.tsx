"use client";

import { ReactNode, useMemo, useState } from "react";
import Link from "next/link";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MeetingStatusBadge,
  MeetingTypeBadge,
  type MeetingRow,
} from "./meeting-badges";
import { formatDateTime } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";

const FILTER_ALL = "all";

export function MeetingsTable({
  meetings,
  newAction,
}: {
  meetings: MeetingRow[];
  newAction?: ReactNode;
}) {
  const [typeFilter, setTypeFilter] = useState<string>(FILTER_ALL);

  const visibleMeetings = useMemo(
    () =>
      typeFilter === FILTER_ALL
        ? meetings
        : meetings.filter((meeting) => meeting.meeting_type === typeFilter),
    [meetings, typeFilter],
  );

  const columns = useMemo<PortalDataTableColumn<MeetingRow>[]>(
    () => [
      {
        key: "meeting_date",
        label: "Date",
        sortValue: (meeting) => meeting.meeting_date,
        cellClassName: "font-medium",
        render: (meeting) => formatDateTime(meeting.meeting_date),
      },
      {
        key: "meeting_type",
        label: "Type",
        sortValue: (meeting) => meeting.meeting_type,
        render: (meeting) => <MeetingTypeBadge type={meeting.meeting_type} />,
      },
      {
        key: "status",
        label: "Status",
        sortValue: (meeting) => meeting.status,
        render: (meeting) => <MeetingStatusBadge status={meeting.status} />,
      },
      {
        key: "location",
        label: "Location",
        // Left null rather than coalesced to "", so a meeting with no
        // location sorts to the end either way instead of leading the
        // ascending sort with a column of em dashes.
        sortValue: (meeting) => meeting.location,
        cellClassName: "app-muted",
        render: (meeting) => meeting.location ?? "—",
      },
      {
        key: "actions",
        label: "Actions",
        srOnlyLabel: true,
        headClassName: "w-0",
        render: (meeting) => (
          <Button
            variant="ghost"
            size="icon-sm"
            nativeButton={false}
            aria-label={`View meeting on ${formatDateTime(meeting.meeting_date)}`}
            render={<Link href={`/portal/governance/meetings/${meeting.id}`} />}
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
      <div className="rainbow-surface flex flex-wrap items-end justify-between gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <span className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
              Type
            </span>
            <Select
              value={typeFilter}
              onValueChange={(value) => setTypeFilter(value ?? FILTER_ALL)}
            >
              <SelectTrigger aria-label="Filter by type">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL}>All types</SelectItem>
                <SelectItem value="board">Board</SelectItem>
                <SelectItem value="committee">Committee</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {newAction}
      </div>

      {meetings.length === 0 ? (
        <Card>
          <CardContent className="px-0">
            <EmptyState
              title="No meetings scheduled yet"
              description={
                newAction
                  ? "Schedule the first one with Schedule meeting above."
                  : "Meetings appear here once a governance manager schedules one."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <PortalDataTable
          columns={columns}
          rows={visibleMeetings}
          getRowKey={(meeting) => meeting.id}
          defaultSort={{ key: "meeting_date", dir: "desc" }}
          emptyMessage="No meetings match your filters."
        />
      )}
    </div>
  );
}
