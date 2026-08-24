"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  MeetingStatusBadge,
  MeetingTypeBadge,
  type MeetingRow,
} from "./meeting-badges";
import { MeetingDetailsSheet } from "./meeting-details-sheet";
import { NewMeetingDialog } from "./new-meeting-dialog";

const FILTER_ALL = "all";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function MeetingsTable({
  meetings,
  canManage,
}: {
  meetings: MeetingRow[];
  canManage: boolean;
}) {
  const [typeFilter, setTypeFilter] = useState<string>(FILTER_ALL);

  const visibleMeetings = useMemo(() => {
    if (typeFilter === FILTER_ALL) return meetings;
    return meetings.filter((meeting) => meeting.meeting_type === typeFilter);
  }, [meetings, typeFilter]);

  if (meetings.length === 0) {
    return (
      <div className="space-y-4">
        {canManage && <NewMeetingDialog />}
        <Card>
          <CardContent className="px-0">
            <p className="app-muted px-4 py-6 text-sm">
              No meetings scheduled yet.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {canManage && <NewMeetingDialog />}

        <div className="flex flex-col gap-1">
          <span className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
            Type
          </span>
          <Select
            value={typeFilter}
            onValueChange={(value) => setTypeFilter(value ?? FILTER_ALL)}
          >
            <SelectTrigger className="h-8">
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

      <Card>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="w-0">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleMeetings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="app-muted text-center">
                    No meetings match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                visibleMeetings.map((meeting) => (
                  <TableRow key={meeting.id}>
                    <TableCell className="font-medium">
                      {dateFormatter.format(new Date(meeting.meeting_date))}
                    </TableCell>
                    <TableCell>
                      <MeetingTypeBadge type={meeting.meeting_type} />
                    </TableCell>
                    <TableCell>
                      <MeetingStatusBadge status={meeting.status} />
                    </TableCell>
                    <TableCell className="app-muted">
                      {meeting.location ?? "—"}
                    </TableCell>
                    <TableCell>
                      <MeetingDetailsSheet meeting={meeting} />
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
