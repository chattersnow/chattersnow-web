"use client";

import { useState } from "react";
import { useStickyStatusFilter } from "./use-sticky-status-filter";
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
import { MessageDetailsSheet } from "./message-details-sheet";
import {
  ContactMessageStatusBadge,
  CONTACT_TOPIC_LABELS,
} from "./message-badges";
import {
  CONTACT_MESSAGE_STATUSES,
  type ContactMessage,
  type ContactMessageStatus,
} from "./message-types";
import { formatInstantDate } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";

const FILTER_ALL = "all";

export function MessagesTable({
  messages,
  canManage,
  initialStatusFilter = null,
}: {
  messages: ContactMessage[];
  canManage: boolean;
  initialStatusFilter?: ContactMessageStatus | null;
}) {
  const [search, setSearch] = useState("");
  const {
    status: statusFilter,
    setStatus: setStatusFilter,
    isVisible,
  } = useStickyStatusFilter(messages, initialStatusFilter);

  // Not memoized: isVisible closes over useStickyStatusFilter's internal
  // sticky-id state, which can change via a same-render state update (see
  // that hook) that a memo keyed on messages/search/statusFilter alone
  // wouldn't pick up. The table is small enough that filtering on every
  // render is cheap.
  const query = search.trim().toLowerCase();
  const visibleMessages = messages.filter((message) => {
    if (!isVisible(message)) return false;
    if (
      query &&
      !message.name.toLowerCase().includes(query) &&
      !message.email.toLowerCase().includes(query)
    )
      return false;
    return true;
  });

  const activeFilterCount = [
    search.trim() !== "",
    statusFilter !== null,
  ].filter(Boolean).length;

  if (messages.length === 0) {
    return (
      <Card>
        <CardContent className="px-0">
          <p className="app-muted px-4 py-6 text-sm">No messages yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rainbow-surface flex justify-end rounded-xl border border-[var(--line)] p-4 shadow-md">
        <FiltersSheet activeCount={activeFilterCount}>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="messages-search"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              Search
            </label>
            <Input
              id="messages-search"
              placeholder="Search name or email..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
              Status
            </span>
            <Select
              value={statusFilter ?? FILTER_ALL}
              onValueChange={(value) =>
                setStatusFilter(
                  value === FILTER_ALL ? null : (value as ContactMessageStatus),
                )
              }
            >
              <SelectTrigger aria-label="Filter by status">
                <SelectValue placeholder="Status">
                  {(value: string) =>
                    value === FILTER_ALL ? "All statuses" : value
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL}>All statuses</SelectItem>
                {CONTACT_MESSAGE_STATUSES.map((status) => (
                  <SelectItem
                    key={status}
                    value={status}
                    className="capitalize"
                  >
                    {status}
                  </SelectItem>
                ))}
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
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Topic</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-0">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleMessages.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="app-muted text-center">
                    No messages match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                visibleMessages.map((message) => (
                  <TableRow key={message.id}>
                    <TableCell className="font-medium">
                      {message.name}
                    </TableCell>
                    <TableCell className="app-muted">{message.email}</TableCell>
                    <TableCell className="app-muted">
                      {CONTACT_TOPIC_LABELS[message.topic] ?? message.topic}
                    </TableCell>
                    <TableCell className="app-muted">
                      {formatInstantDate(message.created_at)}
                    </TableCell>
                    <TableCell>
                      <ContactMessageStatusBadge status={message.status} />
                    </TableCell>
                    <TableCell>
                      <MessageDetailsSheet
                        message={message}
                        canManage={canManage}
                      />
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
