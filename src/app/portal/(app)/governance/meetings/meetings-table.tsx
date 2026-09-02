"use client";

import { ReactNode, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, Eye } from "lucide-react";
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

type SortKey = "meeting_date" | "meeting_type" | "status" | "location";

const SORT_COLUMNS: { key: SortKey; label: string }[] = [
  { key: "meeting_date", label: "Date" },
  { key: "meeting_type", label: "Type" },
  { key: "status", label: "Status" },
  { key: "location", label: "Location" },
];

export function MeetingsTable({
  meetings,
  newAction,
}: {
  meetings: MeetingRow[];
  newAction?: ReactNode;
}) {
  const [typeFilter, setTypeFilter] = useState<string>(FILTER_ALL);
  const [sortKey, setSortKey] = useState<SortKey>("meeting_date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  const visibleMeetings = useMemo(() => {
    const filtered =
      typeFilter === FILTER_ALL
        ? meetings
        : meetings.filter((meeting) => meeting.meeting_type === typeFilter);

    const direction = sortDirection === "asc" ? 1 : -1;

    return [...filtered].sort((a, b) => {
      const aValue = sortKey === "location" ? (a.location ?? "") : a[sortKey];
      const bValue = sortKey === "location" ? (b.location ?? "") : b[sortKey];
      return aValue.localeCompare(bValue) * direction;
    });
  }, [meetings, typeFilter, sortKey, sortDirection]);

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
            <p className="app-muted px-4 py-6 text-sm">
              No meetings scheduled yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  {SORT_COLUMNS.map((column) => (
                    <TableHead key={column.key}>
                      <button
                        type="button"
                        onClick={() => handleSort(column.key)}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        {column.label}
                        {sortKey === column.key ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="size-3.5" />
                          ) : (
                            <ArrowDown className="size-3.5" />
                          )
                        ) : (
                          <ArrowUpDown className="size-3.5 text-muted-foreground" />
                        )}
                      </button>
                    </TableHead>
                  ))}
                  <TableHead className="w-0">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleMeetings.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={SORT_COLUMNS.length + 1}
                      className="app-muted text-center"
                    >
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
      )}
    </div>
  );
}
