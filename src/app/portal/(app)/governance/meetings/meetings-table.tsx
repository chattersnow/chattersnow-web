"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import {
  MeetingStatusBadge,
  MeetingTypeBadge,
  type MeetingRow,
} from "./meeting-badges";

const FILTER_ALL = "all";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function MeetingsTable({ meetings }: { meetings: MeetingRow[] }) {
  const [typeFilter, setTypeFilter] = useState<string>(FILTER_ALL);

  const visibleMeetings = useMemo(() => {
    if (typeFilter === FILTER_ALL) return meetings;
    return meetings.filter((meeting) => meeting.meeting_type === typeFilter);
  }, [meetings, typeFilter]);

  const activeFilterCount = typeFilter !== FILTER_ALL ? 1 : 0;

  if (meetings.length === 0) {
    return (
      <Card>
        <CardContent className="px-0">
          <p className="app-muted px-4 py-6 text-sm">
            No meetings scheduled yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rainbow-surface flex justify-end rounded-xl border border-[var(--line)] p-4 shadow-md">
        <FiltersSheet activeCount={activeFilterCount}>
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
        </FiltersSheet>
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
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        nativeButton={false}
                        aria-label={`View meeting on ${dateFormatter.format(
                          new Date(meeting.meeting_date),
                        )}`}
                        render={
                          <Link
                            href={`/portal/governance/meetings/${meeting.id}`}
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
    </div>
  );
}
