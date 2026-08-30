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
import { EditBoardMemberModal } from "./edit-board-member-modal";
import type { BoardMemberRow } from "./board-members-shared";

const FILTER_ALL = "all";
const FILTER_ACTIVE = "active";
const FILTER_PAST = "past";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

function formatDate(value: string | null) {
  if (!value) return "—";
  return dateFormatter.format(new Date(value));
}

export function BoardMembersTable({
  boardMembers,
  canManage,
  newAction,
}: {
  boardMembers: BoardMemberRow[];
  canManage: boolean;
  newAction?: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    typeof FILTER_ALL | typeof FILTER_ACTIVE | typeof FILTER_PAST
  >(FILTER_ACTIVE);

  const visibleBoardMembers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return boardMembers.filter((boardMember) => {
      if (statusFilter === FILTER_ACTIVE && !boardMember.is_active)
        return false;
      if (statusFilter === FILTER_PAST && boardMember.is_active) return false;
      if (!query) return true;
      return (
        (boardMember.person.name ?? "").toLowerCase().includes(query) ||
        boardMember.role_title.toLowerCase().includes(query)
      );
    });
  }, [boardMembers, search, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="rainbow-surface flex flex-wrap items-end justify-between gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="board-members-search"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              Search
            </label>
            <Input
              id="board-members-search"
              className="w-56"
              placeholder="Search name or role..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
              Status
            </span>
            <Select
              value={statusFilter}
              onValueChange={(value) =>
                setStatusFilter(
                  (value as
                    | typeof FILTER_ALL
                    | typeof FILTER_ACTIVE
                    | typeof FILTER_PAST) ?? FILTER_ALL,
                )
              }
            >
              <SelectTrigger aria-label="Filter by status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ACTIVE}>Active</SelectItem>
                <SelectItem value={FILTER_PAST}>Past</SelectItem>
                <SelectItem value={FILTER_ALL}>All</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {newAction}
      </div>

      {boardMembers.length === 0 ? (
        <Card>
          <CardContent className="px-0">
            <p className="app-muted px-4 py-6 text-sm">
              No board members added yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role / title</TableHead>
                  <TableHead>Term start</TableHead>
                  <TableHead>Term end</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-0">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleBoardMembers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="app-muted text-center">
                      No board members match your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleBoardMembers.map((boardMember) => (
                    <TableRow key={boardMember.id}>
                      <TableCell
                        className="max-w-xs truncate font-medium"
                        title={boardMember.person.name ?? undefined}
                      >
                        {boardMember.person.name ?? "—"}
                      </TableCell>
                      <TableCell className="app-muted">
                        {boardMember.role_title}
                      </TableCell>
                      <TableCell className="app-muted">
                        {formatDate(boardMember.term_start)}
                      </TableCell>
                      <TableCell className="app-muted">
                        {formatDate(boardMember.term_end)}
                      </TableCell>
                      <TableCell className="app-muted">
                        {boardMember.is_active ? "Active" : "Past"}
                      </TableCell>
                      <TableCell>
                        {canManage && (
                          <EditBoardMemberModal boardMember={boardMember} />
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
