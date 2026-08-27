"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { FiltersSheet } from "@/components/filters-sheet";
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
import { EditResolutionModal } from "./edit-resolution-modal";
import { VoteOutcomeBadge } from "./resolution-badges";
import type { Resolution } from "./resolutions-actions";
import type { ResolutionMeetingOption } from "./resolutions-shared";
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

function meetingDateFor(
  meetingId: string | null,
  meetings: ResolutionMeetingOption[],
) {
  if (!meetingId) return "—";
  const meeting = meetings.find((m) => m.id === meetingId);
  return meeting ? formatDate(meeting.meeting_date) : "—";
}

export function ResolutionsTable({
  resolutions,
  people,
  meetings,
  canManage,
}: {
  resolutions: Resolution[];
  people: PersonListItem[];
  meetings: ResolutionMeetingOption[];
  canManage: boolean;
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

  const activeFilterCount = [
    search.trim() !== "",
    outcomeFilter !== FILTER_ALL,
  ].filter(Boolean).length;

  if (resolutions.length === 0) {
    return (
      <Card>
        <CardContent className="px-0">
          <p className="app-muted px-4 py-6 text-sm">
            No resolutions recorded yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <FiltersSheet activeCount={activeFilterCount}>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="resolutions-search"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              Search
            </label>
            <Input
              id="resolutions-search"
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
        </FiltersSheet>
      </div>

      <Card>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Motion</TableHead>
                <TableHead>Mover</TableHead>
                <TableHead>Vote outcome</TableHead>
                <TableHead>Effective date</TableHead>
                <TableHead>Meeting</TableHead>
                <TableHead className="w-0">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleResolutions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="app-muted text-center">
                    No resolutions match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                visibleResolutions.map((resolution) => (
                  <TableRow key={resolution.id}>
                    <TableCell
                      className="max-w-xs truncate font-medium"
                      title={resolution.motion_text}
                    >
                      {resolution.motion_text}
                    </TableCell>
                    <TableCell className="app-muted">
                      {resolution.mover.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <VoteOutcomeBadge outcome={resolution.vote_outcome} />
                    </TableCell>
                    <TableCell className="app-muted">
                      {formatDate(resolution.effective_date)}
                    </TableCell>
                    <TableCell className="app-muted">
                      {meetingDateFor(resolution.meeting_id, meetings)}
                    </TableCell>
                    <TableCell>
                      {canManage && (
                        <EditResolutionModal
                          resolution={resolution}
                          people={people}
                          meetings={meetings}
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
    </div>
  );
}
