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
import { EditBoardMemberModal } from "./edit-board-member-modal";
import type { BoardMemberRow } from "./board-members-shared";
import { formatCalendarDate } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";

const FILTER_ALL = "all";
const FILTER_ACTIVE = "active";
const FILTER_PAST = "past";

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

  const columns = useMemo<PortalDataTableColumn<BoardMemberRow>[]>(
    () => [
      {
        key: "name",
        label: "Name",
        sortValue: (boardMember) => boardMember.person.name,
        cellClassName: "max-w-xs truncate font-medium",
        render: (boardMember) => (
          <span title={boardMember.person.name ?? undefined}>
            {boardMember.person.name ?? "—"}
          </span>
        ),
      },
      {
        key: "role_title",
        label: "Role / title",
        sortValue: (boardMember) => boardMember.role_title,
        cellClassName: "app-muted",
        render: (boardMember) => boardMember.role_title,
      },
      {
        key: "term_start",
        label: "Term start",
        sortValue: (boardMember) => boardMember.term_start,
        cellClassName: "app-muted",
        render: (boardMember) => formatCalendarDate(boardMember.term_start),
      },
      {
        key: "term_end",
        label: "Term end",
        sortValue: (boardMember) => boardMember.term_end,
        cellClassName: "app-muted",
        render: (boardMember) => formatCalendarDate(boardMember.term_end),
      },
      {
        key: "status",
        // Sorted on the word the cell shows rather than on the boolean behind
        // it, so "Active" before "Past" is what ascending visibly means.
        label: "Status",
        sortValue: (boardMember) => (boardMember.is_active ? "Active" : "Past"),
        cellClassName: "app-muted",
        render: (boardMember) => (boardMember.is_active ? "Active" : "Past"),
      },
      {
        key: "actions",
        label: "Actions",
        srOnlyLabel: true,
        headClassName: "w-0",
        render: (boardMember) =>
          canManage ? <EditBoardMemberModal boardMember={boardMember} /> : null,
      },
    ],
    [canManage],
  );

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
            <EmptyState
              title="No board members added yet"
              description={
                canManage
                  ? "Add the first one with Add board member above."
                  : "Board members appear here once a governance manager adds them."
              }
            />
          </CardContent>
        </Card>
      ) : (
        // No `defaultSort`: the query orders on is_active then term_start, and
        // a single sort key cannot say that, so the list opens in the order
        // the server sent and the arrows take over from there.
        <PortalDataTable
          columns={columns}
          rows={visibleBoardMembers}
          getRowKey={(boardMember) => boardMember.id}
          emptyMessage="No board members match your filters."
        />
      )}
    </div>
  );
}
